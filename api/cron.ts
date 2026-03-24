import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findLatestApiUrl(): Promise<string | null> {
  try {
    const response = await fetch('https://cm-pump.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const html = await response.text();
    const match = html.match(/const\s+API_URL\s*=\s*['"]([^'"]+)['"]/);
    
    if (match && match[1]) {
      return `https://cm-pump.com/${match[1]}?action=list&limit=500`;
    }
  } catch (e) {
    console.error('Error in findLatestApiUrl:', e);
  }
  return null;
}

export async function GET(request: Request) {
  try {
    // --- PHASE 0: Freshness Check (20-minute threshold) ---
    const { data: currentCache, error: fetchError } = await supabase
      .from('api_cache')
      .select('updated_at')
      .eq('id', 'fuel_data')
      .single();

    if (!fetchError && currentCache) {
      const lastUpdate = new Date(currentCache.updated_at).getTime();
      const now = new Date().getTime();
      const twentyMinutes = 20 * 60 * 1000;

      if (now - lastUpdate < twentyMinutes) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Data is still fresh (within 20 mins)', 
          skipped: true 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // --- PHASE 1: Fetch Fuel Prices from EPPO ---
    // (EPPO logic remains same...)
    const eppoResponse = await fetch('https://www.eppo.go.th/epposite/templates/eppo_v15_mixed/eppo_oil/eppo_oil_gen_new.php', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!eppoResponse.ok) {
        // We continue even if EPPO fails to at least try to sync reports
        console.error(`Failed to fetch EPPO data: ${eppoResponse.status}`);
    } else {
        const html = await eppoResponse.text();
        const rows = html.split(/<div class=['"]oil_price_colum_name_(odd|even)['"]>/i).slice(1);
        const pttPrices: Record<string, number | null> = {};
        const bcpPrices: Record<string, number | null> = {};
        const fuelMapping: Record<string, string> = {
          'oil_name10.png': 'g95_premium', 'oil_name2.png': 'g95', 'oil_name3.png': 'g91',
          'oil_name4.png': 'e20', 'oil_name5.png': 'e85', 'oil_name7.png': 'diesel_premium',
          'oil_name6v2.png': 'diesel', 'b20.png': 'diesel_b20', 'oil_name1.png': 'benzine',
        };

        for (let i = 0; i < rows.length; i += 2) {
          const rowContent = rows[i+1];
          if (!rowContent) continue;
          const labelMatch = rowContent.match(/src=['"].*?\/oil-content\/(.*?)['"]/i);
          if (!labelMatch) continue;
          const fuelKey = fuelMapping[labelMatch[1]];
          if (!fuelKey) continue;
          const priceCols = rowContent.match(/<div class=['"]oil_price_colum['"]>(.*?)<\/div>/gi) || [];
          const prices = priceCols.map(c => {
            const p = parseFloat(c.replace(/<[^>]*>/g, '').trim());
            return isNaN(p) ? null : p;
          });
          if (prices.length >= 1) pttPrices[fuelKey] = prices[0];
          if (prices.length >= 2) bcpPrices[fuelKey] = prices[1];
        }

        if (Object.keys(pttPrices).length > 0) {
            const now = new Date();
            const thTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
            const today = thTime.toISOString().split('T')[0];
            await supabase.from('fuel_prices_history').upsert({ date: today, prices: { ptt: pttPrices, bangchak: bcpPrices } }, { onConflict: 'date' });
        }
    }

    // --- PHASE 2: Fetch Reports URL from Config & Fetch Data ---
    let { data: configData } = await supabase
      .from('config')
      .select('value')
      .eq('id', 'reports_url')
      .single();

    let reportsUrl = configData?.value;
    let reportsJson: any = null;

    const fetchWithFallback = async (url: string) => {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': 'https://cm-pump.com/',
                }
            });
            if (!response.ok) return null;
            const json = await response.json();
            return json.ok ? json : null;
        } catch (e) {
            return null;
        }
    };

    if (reportsUrl) {
        reportsJson = await fetchWithFallback(reportsUrl);
    }

    // FALLBACK: If current URL fails, discover new one
    if (!reportsJson) {
        console.log('Current reports URL failed or invalid. Discovering new one...');
        const newUrl = await findLatestApiUrl();
        if (newUrl) {
            console.log('Discovered new API URL:', newUrl);
            reportsUrl = newUrl;
            // Update config in Supabase
            await supabase.from('config').upsert({ id: 'reports_url', value: newUrl });
            // Retry fetch
            reportsJson = await fetchWithFallback(newUrl);
        }
    }

    if (reportsJson && reportsJson.reports) {
      // 1. Sync station metadata to permanent 'stations' table
      const stationsToSync = reportsJson.reports.map((r: any) => ({
        osm_id: r.osm_id,
        api_id: r.id, // Store the original ID from cm-pump
        station_name: r.station_name,
        brand: r.brand,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lng),
        updated_at: new Date().toISOString()
      })).filter((s: any) => s.osm_id && !isNaN(s.lat) && !isNaN(s.lng));

      if (stationsToSync.length > 0) {
        await supabase.from('stations').upsert(stationsToSync, { onConflict: 'osm_id' });
      }

      // 2. Upsert the full reports into api_cache for the frontend
      await supabase.from('api_cache').upsert({
        id: 'fuel_data',
        data: { reports: reportsJson.reports },
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    }

    // --- PHASE 3: Logging & Response ---
    const syncStatus = reportsJson ? 'success' : 'error';
    const discoveryStatus = reportsUrl !== configData?.value ? (reportsJson ? 'success' : 'failed') : 'skipped';
    
    await supabase.from('sync_logs').insert({
      status: syncStatus,
      updated_stations: reportsJson?.reports?.length || 0,
      discovery_status: discoveryStatus,
      discovered_url: reportsUrl !== configData?.value ? reportsUrl : null,
      error_message: !reportsJson ? 'Failed to fetch or parse reports' : null
    });

    return new Response(JSON.stringify({ 
      success: true, 
      reports_updated: !!reportsJson,
      stations_synced: reportsJson?.reports?.length || 0,
      discovery: discoveryStatus === 'success' ? 'URL updated' : discoveryStatus
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error executing sync:', error.message);
    
    // Log fatal error
    await supabase.from('sync_logs').insert({
      status: 'error',
      updated_stations: 0,
      discovery_status: 'failed',
      error_message: error.message
    });

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
