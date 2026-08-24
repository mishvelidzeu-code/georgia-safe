// "revenuecat-webhook" Supabase Edge Function.
//
// RevenueCat calls this whenever a purchase happens, renews, or lapses. It is
// the ONLY thing that writes public.entitlements — the app can read that table
// but never write it, so a patched client cannot grant itself premium.
//
// Why we compute expiry ourselves for the passes: RevenueCat does not expire
// one-time purchases. Its docs state that a consumable attached to an
// entitlement stays unlocked forever, and that a non-renewing subscription's
// duration "is not managed by Apple/StoreKit so you'll need to manage this
// yourself". So for pass_5d / pass_10d we take the purchase time and add the
// duration. For the monthly subscription RevenueCat does send an expiry, and
// we store that instead — it already accounts for renewals and cancellations.
//
// Deploy:  supabase functions deploy revenuecat-webhook --no-verify-jwt
//   (--no-verify-jwt because RevenueCat is not a Supabase user; the shared
//    secret below is what authenticates it instead.)
//
// Manual setup:
//   1. supabase secrets set REVENUECAT_WEBHOOK_SECRET=<a long random string>
//   2. RevenueCat dashboard → Integrations → Webhooks
//        URL:    https://<project>.supabase.co/functions/v1/revenuecat-webhook
//        Header: Authorization: Bearer <the same random string>

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');

/** Product identifiers as created in App Store Connect / Google Play. */
const PLAN_BY_PRODUCT: Record<string, { plan: string; days: number | null }> = {
  // One-time passes — we own the expiry.
  georgia_safe_pass_5d: { plan: 'pass_5d', days: 5 },
  georgia_safe_pass_10d: { plan: 'pass_10d', days: 10 },
  // Subscription — RevenueCat owns the expiry.
  georgia_safe_monthly: { plan: 'monthly', days: null },
};

/** Events that should grant or extend access. */
const GRANTING = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
]);

/** Events that should revoke immediately (refund, chargeback). */
const REVOKING = new Set(['CANCELLATION', 'EXPIRATION', 'REFUND']);

type RcEvent = {
  type?: string;
  app_user_id?: string;
  product_id?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  cancel_reason?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** PostgREST call with the service role, which bypasses RLS. */
async function db(path: string, init: RequestInit): Promise<Response> {
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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Without this check anyone who found the URL could hand themselves a
  // lifetime subscription. The secret is a value we choose and paste into
  // RevenueCat's dashboard as an Authorization header.
  if (!WEBHOOK_SECRET || req.headers.get('Authorization') !== `Bearer ${WEBHOOK_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Server not configured' }, 500);
  }

  let event: RcEvent;
  try {
    const body = (await req.json()) as { event?: RcEvent };
    event = body.event ?? {};
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const type = event.type ?? '';
  const userId = event.app_user_id ?? '';
  // The app logs into RevenueCat with the Supabase user id, so app_user_id is
  // already the primary key we need. Anonymous RevenueCat ids (a purchase made
  // before sign-in) start with "$RCAnonymousID:" and cannot be matched to a
  // user — those are ignored rather than guessed at.
  if (!userId || userId.startsWith('$RCAnonymousID:')) {
    return json({ ok: true, ignored: 'anonymous or missing app_user_id' });
  }

  if (REVOKING.has(type)) {
    // Expire rather than delete, so the row still shows what was bought when a
    // customer disputes a charge. CANCELLATION means "will not renew", and the
    // remaining paid time should be honoured — so only a refund cuts access
    // short; a plain cancellation is left to lapse on its own expires_at.
    if (type === 'REFUND') {
      await db(`entitlements?user_id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ expires_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      });
    }
    return json({ ok: true, handled: type });
  }

  if (!GRANTING.has(type)) return json({ ok: true, ignored: type });

  const mapping = PLAN_BY_PRODUCT[event.product_id ?? ''];
  if (!mapping) return json({ ok: true, ignored: `unknown product ${event.product_id}` });

  let expiresAt: string;
  if (mapping.days !== null) {
    const purchasedAt = event.purchased_at_ms ? new Date(event.purchased_at_ms) : new Date();
    expiresAt = new Date(purchasedAt.getTime() + mapping.days * 24 * 60 * 60 * 1000).toISOString();
  } else if (event.expiration_at_ms) {
    expiresAt = new Date(event.expiration_at_ms).toISOString();
  } else {
    return json({ error: 'Subscription event had no expiration' }, 400);
  }

  const res = await db('entitlements?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: userId,
      plan: mapping.plan,
      expires_at: expiresAt,
      rc_user_id: userId,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    // Returning non-2xx makes RevenueCat retry, which is what we want for a
    // transient database problem — the alternative is a paying customer with
    // no access and no second chance.
    return json({ error: 'Could not save entitlement', detail: await res.text() }, 500);
  }

  return json({ ok: true, plan: mapping.plan, expires_at: expiresAt });
});
