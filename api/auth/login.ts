import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // 1. Fetch admin credentials from config
    const { data: configData, error: configError } = await supabase
      .from('config')
      .select('id, value')
      .in('id', ['admin_email', 'admin_password_hash']);

    if (configError) throw configError;

    const adminEmail = configData.find(c => c.id === 'admin_email')?.value;
    const adminPasswordHash = configData.find(c => c.id === 'admin_password_hash')?.value;

    if (!adminEmail || !adminPasswordHash) {
      return new Response(JSON.stringify({ success: false, error: 'Admin account not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    // 2. Verify credentials
    const inputHash = createHash('sha256').update(cleanPassword).digest('hex');
    const storedEmail = adminEmail.trim().toLowerCase();
    const storedHash = adminPasswordHash.trim();

    console.log(`[Login Debug] Comparing Email: "${cleanEmail}" vs "${storedEmail}"`);
    console.log(`[Login Debug] Comparing Hash: "${inputHash.substring(0, 8)}..." vs "${storedHash.substring(0, 8)}..."`);

    if (cleanEmail === storedEmail && inputHash === storedHash) {
      // In a real app, use JWT. Here we return a simple success with a "token"
      // which is just a hash of the password hash for simplicity in this demo ops dash.
      const token = createHash('sha256').update(adminPasswordHash + 'salt-2026').digest('hex');
      
      return new Response(JSON.stringify({ 
        success: true, 
        token: token,
        user: { email: adminEmail } 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
