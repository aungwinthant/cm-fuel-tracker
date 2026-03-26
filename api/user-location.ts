import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const pickClientIp = (request: Request) => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    null
  );
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { status: 400 });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid coordinates' }), { status: 400 });
    }

    const ipAddress = pickClientIp(request);
    const userAgent =
      typeof body.user_agent === 'string' && body.user_agent.trim().length > 0
        ? body.user_agent.trim()
        : request.headers.get('user-agent') || null;

    const insertPayload = {
      lat,
      lng,
      user_agent: userAgent,
      ip_address: ipAddress,
    };

    let error: any = null;

    if (ipAddress) {
      ({ error } = await supabase
        .from('user_locations')
        .upsert(insertPayload, { onConflict: 'ip_address' }));
    } else {
      ({ error } = await supabase.from('user_locations').insert({
        lat,
        lng,
        user_agent: userAgent,
      }));
    }

    // Fallback for schemas without ip_address column.
    if (error && /ip_address/i.test(error.message || '')) {
      ({ error } = await supabase.from('user_locations').insert({
        lat,
        lng,
        user_agent: userAgent,
      }));
    }

    if (error) {
      console.error('[user-location] insert error:', error);
      return new Response(JSON.stringify({ success: false, error: 'Insert failed' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[user-location] error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const webReq = new Request(`https://${req.headers.host}${req.url || '/api/user-location'}`, {
    method: 'POST',
    headers: new Headers(req.headers as Record<string, string>),
    body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
  });

  const webRes = await POST(webReq);
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  res.status(webRes.status);
  res.send(await webRes.text());
}
