import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnostic() {
  console.log('--- Supabase Diagnostic (using Anon Key) ---');
  console.log(`URL: ${supabaseUrl}`);
  
  const { data: userLocs, error: locError } = await supabase
    .from('user_locations')
    .select('*')
    .limit(5);

  if (locError) {
    console.error('Error fetching user_locations:', locError.message);
  } else {
    console.log(`Found ${userLocs?.length || 0} user location records.`);
    if (userLocs && userLocs.length > 0) {
      console.log('Sample record:', JSON.stringify(userLocs[0], null, 2));
    }
  }

  const { data: stations, error: statError } = await supabase
    .from('stations')
    .select('count')
    .single();

  if (statError) {
    console.error('Error fetching stations count:', statError.message);
  } else {
    console.log('Stations table is accessible.');
  }
}

diagnostic();
