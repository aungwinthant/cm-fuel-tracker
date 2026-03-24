import fetch from 'node-fetch';
import * as dotenv from 'dotenv';

dotenv.config();

async function triggerSync() {
  const isRemote = process.argv[2] === 'remote';
  const baseUrl = isRemote 
    ? (process.env.APP_URL || 'https://your-vercel-domain.com') 
    : 'http://localhost:3001';
    
  const url = `${baseUrl}/api/cron?force=true`;
  
  console.log(`\n--- Triggering ${isRemote ? 'REMOTE' : 'LOCAL'} Sync ---`);
  console.log(`Target: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    const json = await response.json() as any;
    console.log('\nResponse Status:', response.status);
    console.log('Result:', JSON.stringify(json, null, 2));
    
    if (json.success) {
      console.log('\n✅ Sync triggered successfully!');
    } else {
      console.log('\n❌ Sync failed:', json.error);
    }
  } catch (error: any) {
    console.error('\n❌ Error triggering sync:', error.message);
  }
}

triggerSync().catch(console.error);
