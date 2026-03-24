import { GET } from '../api/cron';
import * as dotenv from 'dotenv';

dotenv.config();

async function runTest() {
  console.log('--- Simulating Cron Call ---');
  
  // Create a mock Request object
  const req = new Request('http://localhost:3001/api/cron?force=true', {
    method: 'GET'
  });

  try {
    const res = await GET(req);
    const json = await res.json();
    console.log('Status:', res.status);
    console.log('Body:', JSON.stringify(json, null, 2));
    
    if (json.success) {
      console.log('\n✅ Sync Simulation Successful!');
    } else {
      console.log('\n❌ Sync Simulation Failed:', json.error);
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error in simulation:', error);
  }
}

runTest().catch(console.error);
