import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
  console.log('--- Current Sync Status & Config ---');
  
  // Check config
  const { data: config, error: configError } = await supabase
    .from('config')
    .select('*')
    .eq('id', 'reports_url')
    .single();
    
  if (configError) {
    console.error('Error fetching config:', configError.message);
  } else {
    console.log('Current reports_url:', config?.value);
  }

  // Check sync_logs
  const { data: logs, error: logsError } = await supabase
    .from('sync_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(5);

  if (logsError) {
    console.error('Error fetching logs:', logsError.message);
  } else {
    console.log('\nLast 5 Sync Logs:');
    console.table(logs.map(l => ({
      time: l.timestamp,
      status: l.status,
      updated: l.updated_stations,
      discovery: l.discovery_status,
      error: l.error_message?.substring(0, 50) + (l.error_message?.length > 50 ? '...' : '')
    })));
  }

  // Check api_cache
  const { data: cache, error: cacheError } = await supabase
    .from('api_cache')
    .select('updated_at')
    .eq('id', 'fuel_data')
    .single();

  if (cacheError) {
    console.error('\nError fetching cache:', cacheError.message);
  } else {
    console.log('\nAPI Cache last updated at:', cache?.updated_at);
  }
}

checkStatus();
