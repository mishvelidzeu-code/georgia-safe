// "sync-entitlement" Supabase Edge Function.
//
// Asks RevenueCat directly what the signed-in user has bought and writes the
// result to public.entitlements. The webhook remains the normal path; this is
// the belt-and-braces path for the two cases where the webhook alone leaves a
// paying customer without access:
//   - Restore Purchases on a new device / new account: RevenueCat restores
//     the receipt but does not replay INITIAL_PURCHASE to the webhook.
//   - A slow or misconfigured webhook right after a purchase: the app polls
//     for ~10s and then shows the paywall again to someone who just paid.
//
// Only ever EXTENDS access — it never shortens an entitlement, so it cannot
// undo a refund the webhook already applied... nor can a patched client gain
// anything: the answer comes from RevenueCat's servers, not from the request.
//
// Deploy:  supabase functions deploy sync-entitlement
// Secrets: REVENUECAT_SECRET_KEY  (RevenueCat → Project settings → API keys →
//          a *secret* key, "sk_..."; the public app key will NOT work here)

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const REVENUECAT_SECRET_KEY = Deno.env.get('REVENUECAT_SECRET_KEY');

/** Same table as the webhook — keep the two in sync. */
const PLAN_BY_PRODUCT: Record<string, { plan: string; days: number | null }> = {
  georgia_safe_pass_5d: { plan: 'pass_5d', days: 5 },
  georgia_safe_pass_10d: { plan: 'pass_10d', days: 10 },
  georgia_safe_monthly: { plan: 'monthly', days: null },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function db(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY ?? '',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

type RcSubscriber = {
  subscriber?: {
    subscriptions?: Record<string, { expires_date?: string | null; refunded_at?: string | null }>;
    non_subscriptions?: Record<string, { purchase_date?: string }[]>;
  };
};

/**
 * The latest moment access should last to, given everything bought. Passes
 * stack: a second 5-day pass bought while the first is running starts when
 * the first ends, which is what a tourist who bought two expects.
 */
function computeAccess(data: RcSubscriber): { plan: string; expiresAt: Date } | null {
  let best: { plan: string; expiresAt: Date } | null = null;
  const consider = (plan: string, expiresAt: Date) => {
    if (!best || expiresAt > best.expiresAt) best = { plan, expiresAt };
  };

  const passes: { plan: string; days: number; purchasedAt: Date }[] = [];
  for (const [productId, purchases] of Object.entries(data.subscriber?.non_subscriptions ?? {})) {
    const mapping = PLAN_BY_PRODUCT[productId];
    if (!mapping || mapping.days === null) continue;
    for (const purchase of purchases) {
      if (!purchase.purchase_date) continue;
      passes.push({ plan: mapping.plan, days: mapping.days, purchasedAt: new Date(purchase.purchase_date) });
    }
  }
  passes.sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
  let runningEnd = 0;
  for (const pass of passes) {
    const start = Math.max(runningEnd, pass.purchasedAt.getTime());
    runningEnd = start + pass.days * DAY_MS;
    consider(pass.plan, new Date(runningEnd));
  }

  for (const [productId, sub] of Object.entries(data.subscriber?.subscriptions ?? {})) {
    const mapping = PLAN_BY_PRODUCT[productId];
    if (!mapping || mapping.days !== null || !sub.expires_date || sub.refunded_at) continue;
    consider(mapping.plan, new Date(sub.expires_date));
  }
  return best;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Server not configured' }, 500);
  if (!REVENUECAT_SECRET_KEY) return json({ error: 'REVENUECAT_SECRET_KEY is not set' }, 500);

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json({ error: 'Unauthorized' }, 401);
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return json({ error: 'Unauthorized' }, 401);
  const userId = ((await userRes.json()) as { id?: string }).id;
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  // The app logs into RevenueCat with the Supabase user id (see lib/premium.ts),
  // so that id is the subscriber id here.
  const rcRes = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${REVENUECAT_SECRET_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!rcRes.ok) return json({ error: 'RevenueCat lookup failed', status: rcRes.status }, 502);
  const access = computeAccess((await rcRes.json()) as RcSubscriber);
  const now = Date.now();
  if (!access || access.expiresAt.getTime() <= now) return json({ premium: false });

  // Extend only. The webhook is the one that shortens (refunds).
  const existingRes = await db(`entitlements?user_id=eq.${userId}&select=expires_at`);
  const existing = existingRes.ok ? ((await existingRes.json()) as { expires_at?: string }[])[0] : undefined;
  const existingEnd = existing?.expires_at ? new Date(existing.expires_at).getTime() : 0;
  if (existingEnd < access.expiresAt.getTime()) {
    const res = await db('entitlements?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: userId,
        plan: access.plan,
        expires_at: access.expiresAt.toISOString(),
        rc_user_id: userId,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) return json({ error: 'Could not save entitlement', detail: await res.text() }, 500);
  }
  return json({ premium: true, plan: access.plan, expires_at: access.expiresAt.toISOString() });
});
