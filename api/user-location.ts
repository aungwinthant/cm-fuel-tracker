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

    const updatedAt = new Date().toISOString();
    const buildPayload = (includeUpdatedAt: boolean, includeIp: boolean) => ({
      lat,
      lng,
      user_agent: userAgent,
      ...(includeIp && ipAddress ? { ip_address: ipAddress } : {}),
      ...(includeUpdatedAt ? { updated_at: updatedAt } : {}),
    });

    let error: any = null;

    if (ipAddress) {
      ({ error } = await supabase
        .from('user_locations')
        .upsert(buildPayload(true, true), { onConflict: 'ip_address' }));
    } else {
      ({ error } = await supabase
        .from('user_locations')
        .insert(buildPayload(true, false)));
    }

    // Fallback for schemas without updated_at column.
    if (error && /updated_at/i.test(error.message || '')) {
      if (ipAddress) {
        ({ error } = await supabase
          .from('user_locations')
          .upsert(buildPayload(false, true), { onConflict: 'ip_address' }));
      } else {
        ({ error } = await supabase
          .from('user_locations')
          .insert(buildPayload(false, false)));
      }
    }

    // Fallback for schemas without ip_address column.
    if (error && /ip_address/i.test(error.message || '')) {
      ({ error } = await supabase
        .from('user_locations')
        .insert(buildPayload(true, false)));
    }

    // Fallback for schemas missing both updated_at and ip_address columns.
    if (error && /updated_at/i.test(error.message || '')) {
      ({ error } = await supabase
        .from('user_locations')
        .insert(buildPayload(false, false)));
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

  const rawHeaders = req.headers || {};
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === 'undefined') continue;
    if (Array.isArray(value)) headers.set(key, value.join(','));
    else headers.set(key, String(value));
  }

  const socketIp =
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    null;

  if (!headers.get('x-forwarded-for') && socketIp) {
    headers.set('x-forwarded-for', socketIp);
  }

  const host = headers.get('host') || req.headers?.host || 'localhost';
  const url = req.url || '/api/user-location';

  const webReq = new Request(`https://${host}${url}`, {
    method: 'POST',
    headers,
    body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
  });

  const webRes = await POST(webReq);
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  res.status(webRes.status);
  res.send(await webRes.text());
}
