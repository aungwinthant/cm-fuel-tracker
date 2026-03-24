import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  try {
    // Basic Bearer Token Auth (for simplicity in this internal dashboard)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });

    const { data: configData } = await supabase
      .from('config')
      .select('value')
      .eq('id', 'admin_password_hash')
      .single();

    if (!configData) return new Response(JSON.stringify({ success: false, error: 'Auth system failed' }), { status: 500 });
    
    // Trim stored hash for robustness
    const storedHash = configData.value.trim();
    const expectedToken = createHash('sha256').update(storedHash + 'salt-2026').digest('hex');

    if (authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), { status: 401 });
    }

    // 1. Fetch Latest Sync Log
    const { data: syncLogs } = await supabase
      .from('sync_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1);

    // 2. Fetch Last 10 User Locations
    const { data: userLocations, error: locError } = await supabase
      .from('user_locations')
      .select('*')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (locError) {
      console.error('[Stats API] user_locations fetch error:', locError);
    }

    // 3. Fetch Last 10 Synced Stations
    const { data: latestStations } = await supabase
      .from('stations')
      .select('osm_id, station_name, brand, updated_at')
      .order('updated_at', { ascending: false })
      .limit(10);

    // Normalize user locations for the frontend
    const normalizedUserLocs = (userLocations || []).map(loc => ({
      lat: Number(loc.lat),
      lng: Number(loc.lng),
      user_agent: loc.user_agent,
      timestamp: loc.created_at || loc.timestamp || new Date().toISOString()
    })).filter(loc => !isNaN(loc.lat) && !isNaN(loc.lng));

    return new Response(JSON.stringify({
      success: true,
      latestSync: syncLogs?.[0] ? {
        ...syncLogs[0],
        discovery_status: syncLogs[0].discovery_status || 'skipped',
        discovered_url: syncLogs[0].discovered_url || null
      } : null,
      userLocations: normalizedUserLocs,
      latestStations: latestStations || []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Stats API] Fatal error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
