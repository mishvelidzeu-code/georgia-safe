// "guardian" Supabase Edge Function (v2 — Phase 5 + post-5 upgrade).
//
// A thin proxy between the app and the Claude API. The Anthropic API key
// lives ONLY here, as a Supabase secret (ANTHROPIC_API_KEY) — it is never
// bundled into the app or sent to the client (see gegma.txt 5.1: "API key
// მხოლოდ Edge Function-ში, არასდროს აპში!").
//
// v2 additions:
// - Conversation memory: the app sends the recent chat history (capped at
//   MAX_HISTORY turns both client- and server-side so cost can't creep up).
// - App-aware system prompt: Guardian knows every screen and feature of
//   Georgia Safe and answers in whatever language the user writes in.
// - Places protocol: when Claude recommends specific visitable places it
//   appends a fenced ```places``` JSON block; we parse it out here and
//   return { reply, places } so the app can render tappable
//   "open in Google Maps" chips. Claude never emits coordinates (it could
//   hallucinate them) — only search queries, which Google Maps resolves.
// - Prompt caching on the system block: repeat messages in a conversation
//   read the system prompt from cache at ~10% of the input price.
//
// Cost guards (explicit user requirement — "არ გაიზარდოს ხარჯი"):
// effort stays "low", history is hard-capped, per-message length is
// hard-capped, max_tokens 1024, system prompt cached.
//
// Deploy:  supabase functions deploy guardian
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';

// Hard cost caps.
const MAX_MESSAGE_LENGTH = 2000; // chars per turn
const MAX_HISTORY = 12; // turns sent to Claude
const MAX_OUTPUT_TOKENS = 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ZoneLevel = 'green' | 'yellow' | 'red';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

type GuardianRequest = {
  // v2 clients send the whole recent conversation; v1 clients sent a single
  // message string — both shapes are accepted.
  messages?: ChatTurn[];
  message?: string;
  zoneName?: string;
  zoneLevel?: ZoneLevel;
  timeOfDay?: 'day' | 'night';
};

type Place = { name: string; query: string };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function sanitizeHistory(body: GuardianRequest): ChatTurn[] {
  const raw: ChatTurn[] = Array.isArray(body.messages)
    ? body.messages
    : typeof body.message === 'string'
      ? [{ role: 'user', content: body.message }]
      : [];

  const cleaned = raw
    .filter(
      (turn) =>
        turn &&
        (turn.role === 'user' || turn.role === 'assistant') &&
        typeof turn.content === 'string' &&
        turn.content.trim().length > 0,
    )
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_MESSAGE_LENGTH) }))
    .slice(-MAX_HISTORY);

  // The Messages API requires the conversation to start with a user turn.
  while (cleaned.length > 0 && cleaned[0].role !== 'user') cleaned.shift();
  return cleaned;
}

function buildSystemPrompt(context: Omit<GuardianRequest, 'message' | 'messages'>): string {
  const parts = [
    'You are Guardian, the built-in AI safety assistant of the Georgia Safe mobile app — ' +
      'a safety companion for tourists (especially solo female travelers) visiting Georgia ' +
      '(the country). You are talking to a tourist inside the app right now.',

    'The app you live in has 5 tabs. Map: Tbilisi safety zones drawn as green/yellow/red ' +
      'circles with separate day and night ratings, tourist landmarks, and safe places ' +
      '(24h pharmacies, ATMs, hospitals, police, toilets); tapping a zone shows tips and ' +
      '"I felt safe/unsafe here" feedback buttons. Getting Around: Bolt and Yandex Go ' +
      'buttons, typical taxi fares in GEL, car/scooter rental contacts, and taxi safety ' +
      'tips. Alerts: common tourist scams by category (taxi, bar, exchange, street, shop) ' +
      'with severity. Emergency: a big Call 112 button, patrol police and health hotlines, ' +
      'hospitals with call/directions buttons, the user\'s own embassy, Georgian phrases to ' +
      'show a local, and a fake-call button. Profile: app language (English/Georgian/' +
      'Russian), nationality, a trusted contact (name + phone), a check-in timer that ' +
      'automatically texts the trusted contact with GPS location if the user doesn\'t ' +
      'confirm they\'re back in time, and a fake-call button. On every screen there is a ' +
      'red floating SOS button (bottom-right) that can call 112 or text the trusted ' +
      'contact an SOS SMS with a GPS location link; you are opened from the Guardian ' +
      'button (bottom-left). When it genuinely helps, point the user to these features by ' +
      'name and location in the app.',

    'Core rules: ALWAYS answer in the same language the user writes in (Georgian, English, ' +
      'Russian, or anything else). Be brief and concrete — 2 to 5 sentences unless they ' +
      'ask for more. Use the earlier messages of this conversation; do not ask for ' +
      'information the user already gave. If the situation sounds urgent or dangerous, ' +
      'tell them to call 112 (the single Georgian emergency number) FIRST, before ' +
      'anything else. Never invent phone numbers, addresses, prices, opening hours, or ' +
      'facts about Georgia — if you are not sure, say so plainly.',

    'Places protocol: if — and only if — your answer recommends or mentions specific ' +
      'visitable places (sights, neighborhoods, stations, hospitals, markets...), append ' +
      'at the VERY END of your reply a fenced block in exactly this format:\n' +
      '```places\n' +
      '[{"name":"ნარიყალას ციხე","query":"Narikala Fortress, Tbilisi"}]\n' +
      '```\n' +
      'At most 5 entries. "name" must be in the user\'s language (it becomes a button ' +
      'label); "query" must be an English Google Maps search string (place + city). Never ' +
      'include coordinates. Do not add the block for general advice with no specific ' +
      'places. Do not mention or explain the block in your prose — the app turns it into ' +
      'tappable directions buttons automatically.',
  ];

  if (context.zoneName) {
    const levelPhrase: Record<ZoneLevel, string> = {
      green: 'generally rated safe',
      yellow: 'rated as needing caution',
      red: 'rated higher risk',
    };
    parts.push(
      `Background only, possibly irrelevant to their question: the tourist's GPS is ` +
        `currently nearest to the "${context.zoneName}" zone` +
        (context.zoneLevel ? ` (${levelPhrase[context.zoneLevel]})` : '') +
        `. Only bring this up if actually relevant — never assume their question is ` +
        `about this area.`,
    );
  }

  if (context.timeOfDay) {
    parts.push(`It is currently ${context.timeOfDay === 'night' ? 'nighttime' : 'daytime'} for them.`);
  }

  return parts.join('\n\n');
}

/** Extracts the ```places``` block (if any) out of the reply text. */
function extractPlaces(rawReply: string): { reply: string; places: Place[] } {
  const match = rawReply.match(/```places\s*([\s\S]*?)```/);
  if (!match) return { reply: rawReply.trim(), places: [] };

  const reply = rawReply.replace(match[0], '').trim();
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return { reply, places: [] };
    const places = parsed
      .filter(
        (item): item is Place =>
          item && typeof item.name === 'string' && typeof item.query === 'string',
      )
      .slice(0, 5)
      .map((item) => ({ name: item.name.slice(0, 80), query: item.query.slice(0, 120) }));
    return { reply, places };
  } catch {
    // Malformed block — drop it silently, the prose reply is still good.
    return { reply, places: [] };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('Guardian: ANTHROPIC_API_KEY is not set (supabase secrets set ANTHROPIC_API_KEY=...)');
    return jsonResponse({ error: 'Guardian is not configured on the server.' }, 500);
  }

  let body: GuardianRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const history = sanitizeHistory(body);
  if (history.length === 0) {
    return jsonResponse({ error: 'A non-empty user message is required' }, 400);
  }

  const systemPrompt = buildSystemPrompt({
    zoneName: body.zoneName,
    zoneLevel: body.zoneLevel,
    timeOfDay: body.timeOfDay,
  });

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        // "low" effort: Anthropic's recommended level for chat / latency-
        // sensitive, non-coding use — it also thinks rarely, keeping output
        // tokens (the expensive ones) down.
        output_config: { effort: 'low' },
        max_tokens: MAX_OUTPUT_TOKENS,
        // cache_control: repeat turns of the same conversation read this
        // block from cache at ~10% of the normal input-token price.
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: history,
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      console.error('Guardian: Anthropic API error', anthropicRes.status, detail);
      return jsonResponse({ error: 'Guardian could not respond right now.' }, 502);
    }

    const data = await anthropicRes.json();
    // Never assume content[0] is text — a "thinking" block (when present)
    // comes first.
    const textBlock = Array.isArray(data.content)
      ? data.content.find((block: { type?: string }) => block?.type === 'text')
      : undefined;
    const rawReply = typeof textBlock?.text === 'string' ? textBlock.text : '';

    if (!rawReply) {
      console.error('Guardian: unexpected Anthropic response shape', JSON.stringify(data));
      return jsonResponse({ error: 'Guardian could not respond right now.' }, 502);
    }

    const { reply, places } = extractPlaces(rawReply);
    return jsonResponse({ reply, places }, 200);
  } catch (err) {
    console.error('Guardian: request failed', err);
    return jsonResponse({ error: 'Guardian could not respond right now.' }, 502);
  }
});
