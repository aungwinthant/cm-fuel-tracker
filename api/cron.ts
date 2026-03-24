import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  // Check cron secret for security (optional but recommended for Vercel Cron)
  // const authHeader = request.headers.get('authorization');
  // if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return new Response('Unauthorized', { status: 401 });
  // }

  try {
    // Fetch from the direct php script that generates the price table
    const response = await fetch('https://www.eppo.go.th/epposite/templates/eppo_v15_mixed/eppo_oil/eppo_oil_gen_new.php', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch EPPO data: ${response.status}`);
    }

    const html = await response.text();
    
    // The data is in divs, not a table.
    // Each row of prices is in a div with class oil_price_colum_name_odd or even.
    // The first div inside that row is the label (an image).
    // The following divs (class oil_price_colum) are the prices for each brand.
    
    // We split by the row class to identify each row
    const rows = html.split(/<div class=['"]oil_price_colum_name_(odd|even)['"]>/i).slice(1);
    
    const pttPrices: Record<string, number | null> = {};
    const bcpPrices: Record<string, number | null> = {};

    const fuelMapping: Record<string, string> = {
      'oil_name10.png': 'g95_premium',
      'oil_name2.png': 'g95',
      'oil_name3.png': 'g91',
      'oil_name4.png': 'e20',
      'oil_name5.png': 'e85',
      'oil_name7.png': 'diesel_premium',
      'oil_name6v2.png': 'diesel',
      'b20.png': 'diesel_b20',
      'oil_name1.png': 'benzine',
    };

    // Since we split by the odd/even class, each chunk starts with the row content.
    // However, the first element of each chunk will be 'odd' or 'even' due to the capture group.
    for (let i = 0; i < rows.length; i += 2) {
      const rowContent = rows[i+1];
      if (!rowContent) continue;

      const labelMatch = rowContent.match(/src=['"].*?\/oil-content\/(.*?)['"]/i);
      if (!labelMatch) continue;
      
      const imgName = labelMatch[1];
      const fuelKey = fuelMapping[imgName];
      if (!fuelKey) continue;

      const priceCols = rowContent.match(/<div class=['"]oil_price_colum['"]>(.*?)<\/div>/gi) || [];
      const prices = priceCols.map(c => {
        const p = parseFloat(c.replace(/<[^>]*>/g, '').trim());
        return isNaN(p) ? null : p;
      });

      // Index 0 is PTT, Index 1 is BCP (based on header images oil_1.png, oil_2-2.png)
      if (prices.length >= 1) pttPrices[fuelKey] = prices[0];
      if (prices.length >= 2) bcpPrices[fuelKey] = prices[1];
    }

    if (Object.keys(pttPrices).length === 0) {
      console.log('HTML Debug:', html.slice(0, 1000));
      throw new Error("Could not parse any prices. Structure might have changed.");
    }

    const prices = {
      ptt: pttPrices,
      bangchak: bcpPrices
    };

    // Prepare data for Supabase
    // We adjust to Thailand time (UTC+7) for the date
    const now = new Date();
    const thTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const today = thTime.toISOString().split('T')[0];

    // Upsert into fuel_prices_history using the date
    const { data, error } = await supabase
      .from('fuel_prices_history')
      .upsert({
        date: today,
        prices: prices,
      }, { onConflict: 'date' })
      .select();

    if (error) {
      throw error;
    }

    // --- PHASE 2: Fetch Reports URL from Config & Fetch Data ---
    const { data: configData, error: configError } = await supabase
      .from('config')
      .select('value')
      .eq('id', 'reports_url')
      .single();

    if (configError) {
      throw new Error(`Failed to fetch reports_url from config: ${configError.message}`);
    }

    const reportsUrl = configData.value;

    const reportsResponse = await fetch(reportsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://cm-pump.com/',
      }
    });

    if (!reportsResponse.ok) {
      throw new Error(`Failed to fetch reports from ${reportsUrl}: ${reportsResponse.status}`);
    }

    const reportsJson = await reportsResponse.json();

    if (reportsJson.ok && reportsJson.reports) {
      // 1. Sync station metadata to permanent 'stations' table
      const stationsToSync = reportsJson.reports.map((r: any) => ({
        osm_id: r.osm_id,
        station_name: r.station_name,
        brand: r.brand,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lng),
        updated_at: new Date().toISOString()
      })).filter((s: any) => s.osm_id && !isNaN(s.lat) && !isNaN(s.lng));

      if (stationsToSync.length > 0) {
        const { error: syncError } = await supabase
          .from('stations')
          .upsert(stationsToSync, { onConflict: 'osm_id' });
        
        if (syncError) {
          console.error('Error syncing stations:', syncError.message);
        }
      }

      // 2. Upsert the full reports into api_cache for the frontend
      const { error: cacheError } = await supabase
        .from('api_cache')
        .upsert({
          id: 'fuel_data',
          data: { 
            reports: reportsJson.reports,
          },
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (cacheError) {
        throw cacheError;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      date: today, 
      history_updated: true,
      reports_updated: !!reportsJson.ok,
      stations_synced: reportsJson.reports?.length || 0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error: any) {
    console.error('Error executing cron:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
