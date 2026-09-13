// "notify-place-approval" Supabase Edge Function (Phase 4.5c).
//
// Called by a Supabase Database Webhook configured on the `place_submissions`
// table (UPDATE event) — see gegma.txt 4.5c for the exact Dashboard steps.
// When a tourist's submission is approved or later resolved/hidden by an
// administrator, this function sends the author a one-time push notification
// via Expo's push service, using the anonymous `push_token` stored on that row.
//
// No secrets need to be set manually: Supabase automatically injects
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY into every Edge Function's
// environment. The service role key is used only to mark the row as
// `notified` / `resolved_notified` afterwards (bypassing RLS, since the base
// table has no public UPDATE policy) so a re-fired webhook never double-sends.
//
// Deploy: supabase functions deploy notify-place-approval
// Manual one-time setup (Dashboard, cannot be done via migration/CLI):
//   Project → Database → Webhooks → Create a new webhook
//     Table: place_submissions   Events: Update
//     Type: Supabase Edge Functions → notify-place-approval

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PlaceSubmissionRow = {
  id: string;
  approved: boolean;
  notified: boolean;
  resolved_at: string | null;
  resolved_notified: boolean;
  submission_type: 'positive' | 'alert';
  push_token: string | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: PlaceSubmissionRow;
  old_record?: PlaceSubmissionRow;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function sendExpoPush(token: string, title: string, body: string): Promise<boolean> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        channelId: 'default',
      }),
    });
    if (!res.ok) return false;
    const payload = await res.json().catch(() => null) as { data?: Array<{ status?: string }> } | null;
    return Boolean(payload?.data?.every((ticket) => ticket.status === 'ok'));
  } catch {
    return false;
  }
}

async function markNotification(id: string, field: 'notified' | 'resolved_notified'): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/place_submissions?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ [field]: true }),
    });
  } catch {
    // Best-effort — a missed flag just risks one duplicate notification on a
    // future unrelated update to the same row, not a crash.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const record = payload.record;
  const oldRecord = payload.old_record;

  // Act only on the two moderation transitions, each once per submission.
  const justApproved = record?.approved === true && oldRecord?.approved === false;
  const justResolved = Boolean(record?.resolved_at) && !oldRecord?.resolved_at;
  if (!record || (!justApproved && !justResolved)) {
    return jsonResponse({ skipped: true }, 200);
  }

  if (justApproved && !record.notified) {
    const positive = record.submission_type === 'positive';
    if (record.push_token) {
      await sendExpoPush(
        record.push_token,
        positive ? 'თქვენი ადგილი რუკაზე გამოქვეყნებულია' : 'თქვენი გაფრთხილება გამოქვეყნებულია',
        positive
          ? 'ადმინმა დაადასტურა თქვენი ადგილი. ის უკვე ჩანს რუკაზე მწვანე პინით.'
          : 'ადმინმა დაადასტურა თქვენი გაფრთხილება. ის უკვე ჩანს რუკაზე და Alerts გვერდზე.',
      );
    }
    await markNotification(record.id, 'notified');
  }

  if (justResolved && !record.resolved_notified) {
    const positive = record.submission_type === 'positive';
    if (record.push_token) {
      await sendExpoPush(
        record.push_token,
        positive ? 'თქვენი რუკის შეტყობინება დამუშავდა' : 'თქვენი გაფრთხილება გადაწყდა',
        positive
          ? 'ადმინმა განიხილა თქვენი შეტყობინება და მწვანე მონიშვნა რუკიდან დამალა.'
          : 'ადმინმა მონიშნა, რომ თქვენ მიერ ატვირთული საკითხი მოგვარებულია.',
      );
    }
    await markNotification(record.id, 'resolved_notified');
  }

  return jsonResponse({ ok: true }, 200);
});
