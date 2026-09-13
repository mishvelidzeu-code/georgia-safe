declare const Deno: { serve: (handler: (req: Request) => Response | Promise<Response>) => void; env: { get: (key: string) => string | undefined } };

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const adminEmail = 'mishvelidze.u@gmail.com';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!url || !serviceKey) return json({ error: 'Server not configured' }, 500);
  const authorization = req.headers.get('Authorization') ?? '';
  const me = await fetch(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: authorization } });
  if (!me.ok) return json({ error: 'Unauthorized' }, 401);
  const caller = await me.json() as { email?: string };
  if (caller.email?.toLowerCase() !== adminEmail) return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const companyName = String(body.companyName ?? '').trim();
  const city = String(body.city ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  const whatsapp = String(body.whatsapp ?? '').trim() || null;
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length < 8 || !companyName || !city || !phone) {
    return json({ error: 'Invalid fields' }, 400);
  }
  const email = String(body.email ?? '').trim().toLowerCase() || `${username}@partners.georgia-safe.internal`;
  const create = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: 'partner', username } }),
  });
  if (!create.ok) return json({ error: 'Could not create account', detail: await create.text() }, 400);
  const user = await create.json() as { id: string };
  const insert = await fetch(`${url}/rest/v1/partners`, {
    method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: user.id, company_name: companyName, username, city, phone, whatsapp, approved: true, active: true, requires_password_change: true }),
  });
  if (!insert.ok) {
    await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    return json({ error: 'Could not create partner', detail: await insert.text() }, 400);
  }
  return json({ ok: true, username, status: 'active' });
});

