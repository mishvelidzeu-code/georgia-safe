declare const Deno: { serve: (handler: (req: Request) => Response | Promise<Response>) => void; env: { get: (key: string) => string | undefined } };
const url = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!url || !anonKey || !serviceKey) return json({ error: 'Server not configured' }, 500);
  const body = await req.json().catch(() => ({})) as { username?: string; password?: string };
  const username = String(body.username ?? '').trim().toLowerCase();
  const lookup = await fetch(`${url}/rest/v1/partners?select=user_id,active&username=eq.${encodeURIComponent(username)}&limit=1`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  const rows = lookup.ok ? await lookup.json() as { user_id: string; active: boolean }[] : [];
  if (!rows[0]?.active) return json({ error: 'Invalid credentials' }, 400);
  const userRes = await fetch(`${url}/auth/v1/admin/users/${rows[0].user_id}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  const user = userRes.ok ? await userRes.json() as { email?: string } : {};
  if (!user.email) return json({ error: 'Invalid credentials' }, 400);
  const token = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: String(body.password ?? '') }),
  });
  if (!token.ok) return json({ error: 'Invalid credentials' }, 400);
  const session = await token.json();
  return json({ access_token: session.access_token, refresh_token: session.refresh_token });
});
