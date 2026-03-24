import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testWrite() {
  console.log('--- Testing sync_logs Write ---');
  
  // Try writing WITHOUT timestamp (letting it default)
  console.log('Test 1: Writing without explicit timestamp...');
  const { data: d1, error: e1 } = await supabase.from('sync_logs').insert({
    status: 'success',
    updated_stations: 0,
    discovery_status: 'skipped',
    error_message: 'DEBUG_TEST_1'
  }).select();

  if (e1) {
    console.log('❌ Test 1 failed:', e1.message);
  } else {
    console.log('✅ Test 1 success!', d1[0]);
  }

  // Try writing WITH timestamp
  console.log('\nTest 2: Writing with explicit timestamp...');
  const { data: d2, error: e2 } = await supabase.from('sync_logs').insert({
    status: 'success',
    updated_stations: 0,
    discovery_status: 'skipped',
    error_message: 'DEBUG_TEST_2',
    timestamp: new Date().toISOString()
  }).select();

  if (e2) {
    console.log('❌ Test 2 failed:', e2.message);
  } else {
    console.log('✅ Test 2 success!', d2[0]);
  }
  
  // Try reading all columns
  console.log('\nReading latest record to see all columns:');
  const { data: latest, error: readError } = await supabase.from('sync_logs').select('*').limit(1);
  if (readError) {
    console.log('❌ Read failed:', readError.message);
  } else if (latest && latest.length > 0) {
    console.log('✅ Found latest record:', JSON.stringify(latest[0], null, 2));
  } else {
    console.log('⚠️ No records found in sync_logs.');
  }
}

testWrite().catch(console.error);
