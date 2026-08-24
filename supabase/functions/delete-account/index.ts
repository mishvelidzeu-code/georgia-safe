// "delete-account" Supabase Edge Function.
//
// App Store Review Guideline 5.1.1(v): an app that lets people create an
// account must let them delete it from inside the app. The client cannot do
// this itself — removing an auth user needs the service role, which must never
// be shipped in an app bundle. So the app asks this function, and the function
// deletes only the caller's own account.
//
// Everything the tourist owns is removed by the cascade on auth.users:
//   profiles, entitlements, guardian_usage, partners (and their cars).
// Places, reviews and zone votes are stored without any user id — they cannot
// be traced back to a person, so there is nothing to delete there.
//
// Deploy:  supabase functions deploy delete-account
//   (JWT verification stays ON: the caller's token is exactly what proves
//    which account may be deleted.)

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Server not configured' }, 500);
  }

  // The account to delete is decided by the token, never by the request body —
  // otherwise anyone could pass someone else's id and delete their account.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: authHeader },
  });
  if (!userRes.ok) return json({ error: 'Unauthorized' }, 401);

  const user = (await userRes.json()) as { id?: string };
  if (!user.id) return json({ error: 'Unauthorized' }, 401);

  const deleteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  if (!deleteRes.ok) {
    // Surfaced so a real failure can be diagnosed instead of silently leaving
    // the account alive while the app says it is gone.
    return json({ error: 'Could not delete account', detail: await deleteRes.text() }, 500);
  }

  return json({ ok: true });
});
