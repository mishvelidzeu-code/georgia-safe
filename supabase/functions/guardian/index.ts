// "guardian" Supabase Edge Function (v3 — switched from Claude to Gemini).
//
// A thin proxy between the app and the Google Gemini API. The Gemini API key
// lives ONLY here, as a Supabase secret (GEMINI_API_KEY) — it is never
// bundled into the app or sent to the client (see gegma.txt 5.1: "API key
// მხოლოდ Edge Function-ში, არასდროს აპში!"). The request/response contract
// with the app (POST {messages, zoneName?, zoneLevel?, timeOfDay?} →
// {reply, places}) is unchanged from the Claude version — src/lib/guardian.ts
// and GuardianModal.tsx needed NO changes for this switch.
//
// v2 features carried over unchanged:
// - Conversation memory: the app sends the recent chat history (capped at
//   MAX_HISTORY turns both client- and server-side so cost can't creep up).
// - App-aware system prompt: Guardian knows every screen and feature of
//   Georgia Safe and answers in the language the tourist chose in the app.
// - Places protocol: when Gemini recommends specific visitable places it
//   appends a fenced ```places``` JSON block; we parse it out here and
//   return { reply, places } so the app can render tappable
//   "open in Google Maps" chips. Guardian never emits coordinates (it could
//   hallucinate them) — only search queries, which Google Maps resolves.
//
// Cost guards (explicit user requirement — "არ გაიზარდოს ხარჯი"):
// history is hard-capped, per-message length is hard-capped, maxOutputTokens
// 1024, and thinkingConfig.thinkingLevel is forced to "minimal" — Gemini's
// Flash models think by default, and heavy thinking can eat into the output
// token budget on a simple chat reply (the same class of bug we hit with
// Claude's adaptive thinking — see the 2026-07-24 "couldn't respond" fix in
// CLAUDE.md — keeping it minimal avoids repeating that here).
//
// Deploy:  supabase functions deploy guardian
// Secret:  supabase secrets set GEMINI_API_KEY=...
//   Get a key at https://aistudio.google.com/apikey — no Google Cloud
//   Console project/billing setup required for reasonable usage (unlike the
//   Places API key), just an AI Studio account.

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// gemini-2.5-flash returns 404 "no longer available to new users" as of
// 2026-07-25 (confirmed via this function's own Dashboard logs after first
// deploy). gemini-3.1-flash-lite has a free tier (user's explicit choice,
// to switch to a paid model later once the app has real usage) — it's a
// 3.x-generation model so it uses thinkingConfig.thinkingLevel, same as
// gemini-3.6-flash (see below), not the 2.5-era thinkingBudget.
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// Hard cost caps.
const MAX_MESSAGE_LENGTH = 2000; // chars per turn
const MAX_HISTORY = 12; // turns sent to Gemini
const MAX_OUTPUT_TOKENS = 1024;
// Mirrors MAX_NEARBY_LANDMARKS in src/lib/guardianContext.ts — capping on
// both sides keeps the prompt small even if one side drifts.
const MAX_NEARBY_LANDMARKS = 15;

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
  // The language the tourist picked in the app. Guessing from the message text
  // is not enough: someone who switches the app to English mid-trip kept being
  // answered in Georgian, because the earlier turns of the conversation were
  // Georgian and short messages ("ok", a place name) carry no language at all.
  language?: 'en' | 'ka' | 'ru';
  city?: string;
  firstName?: string;
  homeCountry?: string;
  visitNumber?: number;
  visitLength?: string;
  ageBand?: string;
  rentalCars?: string[];
  zoneName?: string;
  zoneLevel?: ZoneLevel;
  timeOfDay?: 'day' | 'night';
  // English names of the landmarks our own map has pins for near the user.
  // The client sends only the nearest ~15 (not all 97) — see
  // src/lib/guardianContext.ts for why, and for the cost reasoning.
  nearbyLandmarks?: string[];
  visitedLandmarks?: string[];
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

  // Gemini (like the Messages API) requires the conversation to start with
  // a user turn.
  while (cleaned.length > 0 && cleaned[0].role !== 'user') cleaned.shift();
  return cleaned;
}

const LANGUAGE_NAMES: Record<'en' | 'ka' | 'ru', string> = {
  en: 'English',
  ka: 'Georgian',
  ru: 'Russian',
};

function buildSystemPrompt(context: Omit<GuardianRequest, 'message' | 'messages'>): string {
  const parts = [
    'You are Guardian, the built-in AI safety assistant of the Georgia Safe mobile app — ' +
      'a safety companion for tourists (especially solo female travelers) visiting Georgia ' +
      '(the country). You are talking to a tourist inside the app right now.',

    'The app you live in has 5 tabs.\n' +
      'MAP: safety zones drawn as colored circles, colored purely by a 0-100 score with ' +
      'separate day and night ratings — 80-100 dark green (very safe), 50-79 green (safe), ' +
      '20-49 gold (caution), 0-19 red (high risk); an info button opens a legend of exactly ' +
      'these four bands. Zones are hidden during the day for a clean map and switch on ' +
      'automatically from 19:00 until 06:00. Tapping a zone shows its score, safety tips, ' +
      'and anonymous "I felt safe/unsafe here" buttons. The map also has ~97 curated ' +
      'tourist landmarks across all of Georgia (not just Tbilisi: Mtskheta, Kakheti, the ' +
      'Georgian Military Highway, Svaneti, Racha, Imereti, Samegrelo, Adjara, Guria, ' +
      'Samtskhe-Javakheti, Kvemo Kartli, Shida Kartli), plus safe places (24h pharmacies, ' +
      'ATMs, hospitals, police, toilets) — all toggleable from a Layers panel. The map ' +
      'opens centered on wherever the tourist actually is. When they physically come ' +
      'within 300m of a landmark the app notifies them ("You are here!") and that pin ' +
      'turns green, then shrinks and greys out as "visited" — this works even with the app ' +
      'closed, and visited pins stay tappable. Tapping a landmark or safe place opens a ' +
      'card with directions and a "rate this place" option (stars, comment, optional ' +
      'photo, anonymous). A long press on the map lets the tourist add a brand-new place ' +
      'themselves (category, stars, comment, required photo).\n' +
      'GETTING AROUND: Bolt and Yandex Go buttons, typical taxi fares in GEL, car/scooter ' +
      'rental contacts, and taxi safety tips.\n' +
      'ALERTS: common tourist scams by category (taxi, bar, exchange, street, shop) with ' +
      'severity levels.\n' +
      'EMERGENCY: a big Call 112 button, patrol police and health hotlines, hospitals with ' +
      'call/directions buttons, the user\'s own embassy, Georgian phrases to show a local, ' +
      'and a fake-call button.\n' +
      'PROFILE: app language (English/Georgian/Russian), nationality, a trusted contact ' +
      '(name + phone), a check-in timer that automatically texts the trusted contact with ' +
      'GPS location if the user doesn\'t confirm they\'re back in time, and a fake-call ' +
      'button.\n' +
      'ON EVERY SCREEN: a red floating SOS button (bottom-right) that can call 112 or text ' +
      'the trusted contact an SOS SMS with a GPS location link, and your own mascot button ' +
      '(bottom-left) that opens this chat — it sometimes pops up a small speech bubble ' +
      'suggesting a question. At night in a caution/high-risk zone an orange banner offers ' +
      'a safer route through you. When it genuinely helps, point the user to these ' +
      'features by name and location in the app. Never describe a feature the app does ' +
      'not have; if you are unsure whether it exists, say so instead of guessing.',

    // Older app versions do not send `language`. Defaulting them to English
    // would answer a Georgian tourist in English, so those clients keep the
    // previous behaviour — guess from the text — instead.
    (context.language
      ? `Core rules: ALWAYS write your entire reply in ${LANGUAGE_NAMES[context.language]}. ` +
        'That is the language the user chose in the app, and it wins over the language of ' +
        'their message and over the language of anything earlier in this conversation — if ' +
        'the older turns are in a different language, switch now and stay switched. '
      : 'Core rules: ALWAYS answer in the same language the user writes in (Georgian, ' +
        'English, Russian, or anything else). ') +
      'Be brief and concrete — 2 to 5 sentences unless they ' +
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

  const traveller: string[] = [];
  if (context.firstName) traveller.push(`Their name is ${context.firstName}.`);
  if (context.homeCountry) traveller.push(`They are visiting from ${context.homeCountry}.`);
  if (context.visitLength) {
    const lengthPhrase: Record<string, string> = {
      days: 'a few days',
      week: 'about a week',
      weeks: 'a few weeks',
      month: 'about a month',
      longer: 'longer than a month',
    };
    traveller.push(`This trip lasts ${lengthPhrase[context.visitLength] ?? context.visitLength}.`);
  }
  if (context.ageBand) {
    // A bracket, not an age — the app never sends the real number. Georgia's
    // drinking age is 18; many clubs are 18+, some are 21+; car hire is
    // typically 23-25 and surcharged below that.
    const agePhrase: Record<string, string> = {
      under18:
        'This traveller is UNDER 18. Never suggest bars, clubs, casinos, alcohol or ' +
        'anything age-restricted, and do not present them as options to work around. ' +
        'Keep suggestions to daytime, public and all-ages places.',
      '18-20':
        'This traveller is 18-20. They can legally drink in Georgia and get into 18+ ' +
        'venues, but not 21+ ones — flag that when a specific venue is 21+. Renting a ' +
        'car is usually not possible or is heavily surcharged at this age.',
      '21-23':
        'This traveller is 21-23. Age-restricted nightlife is open to them. Car hire is ' +
        'possible but some companies still require 23+ or add a young-driver fee.',
      '24plus':
        'This traveller is 24 or older. No age restriction is likely to affect what you ' +
        'suggest; do not raise age unless they ask.',
    };
    const phrase = agePhrase[context.ageBand];
    if (phrase) traveller.push(phrase);
  }

  if (context.visitNumber && context.visitNumber > 1) {
    traveller.push(
      `This is visit number ${context.visitNumber} to Georgia — they are NOT a first-timer. ` +
        `Do not open with the obvious headline sights as if they had never been. Assume they ` +
        `have likely already done the standard first-trip route, say so and check ("you've ` +
        `been before, so you have probably already seen X — shall I suggest something you ` +
        `may have missed?"), and lean towards less obvious places, day trips further out, or ` +
        `going deeper into somewhere they liked.`,
    );
  } else if (context.visitNumber === 1) {
    traveller.push(
      `This is their first visit to Georgia — the well-known highlights are genuinely useful ` +
        `to them, and they may need more basic orientation.`,
    );
  }
  if (traveller.length > 0) parts.push(traveller.join(' '));

  if (context.city) {
    parts.push(
      `The tourist is currently in ${context.city}, Georgia. NEVER ask them which city ` +
        `they are in — you already know. Plan days, suggest places and give directions ` +
        `for ${context.city} unless they say otherwise.`,
    );
  }

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

  if (context.nearbyLandmarks && context.nearbyLandmarks.length > 0) {
    parts.push(
      `Landmarks the app itself has map pins for near this tourist right now: ` +
        `${context.nearbyLandmarks.join(', ')}. When they ask what to see, what's nearby, ` +
        `or to plan a day, prefer these — they can find them on the app's own map and get ` +
        `arrival notifications there. You may still mention other real places when these ` +
        `don't fit the question; this list is what's nearby, not everything that exists.`,
    );
  }

  if (context.rentalCars && context.rentalCars.length > 0) {
    parts.push(
      `Rental cars currently listed by this app's own verified partners near the tourist: ` +
        `${context.rentalCars.join('; ')}. If they ask about renting a car, or about a ` +
        `specific one of these, recommend from THIS list first — these are vetted partners ` +
        `and the app can put them in touch. ` +
        `NEVER state or guess a phone number, and never invent a price or a car that is not ` +
        `in the list. To make contact, tell them to open the "Getting Around" tab and tap ` +
        `the car — the call and message buttons are there. ` +
        `Only suggest looking elsewhere if nothing here fits what they need.`,
    );
  }

  if (context.visitedLandmarks && context.visitedLandmarks.length > 0) {
    parts.push(
      `This tourist has ALREADY VISITED these places on this trip: ` +
        `${context.visitedLandmarks.join(', ')}. Do not suggest them again as somewhere ` +
        `to go — they have been there. You may refer back to them ("since you've already ` +
        `seen X..."), and if they explicitly ask about one of them, answer normally. ` +
        `When recommending what to do next, pick from the not-yet-visited list instead.`,
    );
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

// Gemini's `contents` array uses "model" where Anthropic/OpenAI use
// "assistant" — everything else about our internal ChatTurn shape stays the
// same across the whole app.
function toGeminiContents(history: ChatTurn[]): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  return history.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.content }],
  }));
}

/**
 * How many Guardian messages a user gets before paying. A lifetime total, not
 * a daily quota: a daily reset teaches people to wait for tomorrow rather than
 * subscribe, and across a week-long trip it gives away more than the plan
 * would sell. Five is enough for one real multi-turn conversation, which is
 * where Guardian's value actually shows — a single question just looks like
 * any other chatbot.
 */
const FREE_MESSAGE_LIMIT = 5;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

/** PostgREST with the service role, which bypasses RLS. */
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

/**
 * Resolves the caller from their Supabase session token, then decides whether
 * this message is allowed: unlimited while an entitlement is unexpired,
 * otherwise counted against FREE_MESSAGE_LIMIT.
 *
 * Fails OPEN on an infrastructure error. If our own database is unreachable,
 * the right outcome for a safety app is that a woman still gets an answer —
 * the cost of a few unbilled messages is not comparable.
 */
async function checkAccess(req: Request): Promise<{ allowed: boolean; premium: boolean }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return { allowed: true, premium: false };

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { allowed: true, premium: false };

  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return { allowed: true, premium: false };
    const user = (await userRes.json()) as { id?: string };
    const userId = user.id;
    if (!userId) return { allowed: true, premium: false };

    const entRes = await db(
      `entitlements?user_id=eq.${userId}&select=expires_at&expires_at=gt.${new Date().toISOString()}`,
    );
    if (entRes.ok) {
      const rows = (await entRes.json()) as unknown[];
      if (rows.length > 0) return { allowed: true, premium: true };
    }

    const usageRes = await db(`guardian_usage?user_id=eq.${userId}&select=free_messages_used`);
    const used = usageRes.ok
      ? (((await usageRes.json()) as { free_messages_used?: number }[])[0]?.free_messages_used ?? 0)
      : 0;
    if (used >= FREE_MESSAGE_LIMIT) return { allowed: false, premium: false };

    // Upsert the incremented count. Read-then-write can undercount if someone
    // fires two messages at once, but the worst case is one extra free message
    // — not worth a stored procedure.
    await db('guardian_usage?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: userId,
        free_messages_used: used + 1,
        updated_at: new Date().toISOString(),
      }),
    });
    return { allowed: true, premium: false };
  } catch {
    return { allowed: true, premium: false };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!GEMINI_API_KEY) {
    console.error('Guardian: GEMINI_API_KEY is not set (supabase secrets set GEMINI_API_KEY=...)');
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

  // Paywall. Checked here rather than in the app because every message past
  // this point costs money — a hidden button in the UI is not a limit, and
  // this function is callable directly with a valid session token.
  const access = await checkAccess(req);
  if (!access.allowed) {
    return jsonResponse(
      { error: 'limit_reached', freeRemaining: 0, freeLimit: FREE_MESSAGE_LIMIT },
      402,
    );
  }

  const systemPrompt = buildSystemPrompt({
    // Whitelisted: only these three exist in the app, and an arbitrary string
    // must never reach the prompt.
    language:
      body.language === 'en' || body.language === 'ka' || body.language === 'ru'
        ? body.language
        : undefined,
    city: typeof body.city === 'string' ? body.city.slice(0, 80) : undefined,
    firstName: typeof body.firstName === 'string' ? body.firstName.slice(0, 40) : undefined,
    homeCountry: typeof body.homeCountry === 'string' ? body.homeCountry.slice(0, 60) : undefined,
    visitNumber:
      typeof body.visitNumber === 'number' && body.visitNumber >= 1 && body.visitNumber <= 99
        ? Math.round(body.visitNumber)
        : undefined,
    visitLength: typeof body.visitLength === 'string' ? body.visitLength.slice(0, 20) : undefined,
    // Whitelisted rather than truncated: only these four values mean anything
    // to the prompt, so anything else is dropped instead of echoed into it.
    ageBand:
      typeof body.ageBand === 'string' &&
      ['under18', '18-20', '21-23', '24plus'].includes(body.ageBand)
        ? body.ageBand
        : undefined,
    zoneName: body.zoneName,
    zoneLevel: body.zoneLevel,
    timeOfDay: body.timeOfDay,
    // Hard-capped server-side too, so a malformed/hostile client can't inflate
    // the prompt (and the bill) by sending an unbounded list.
    nearbyLandmarks: Array.isArray(body.nearbyLandmarks)
      ? body.nearbyLandmarks
          .filter((name): name is string => typeof name === 'string' && name.length > 0)
          .slice(0, MAX_NEARBY_LANDMARKS)
          .map((name) => name.slice(0, 80))
      : undefined,
    rentalCars: Array.isArray(body.rentalCars)
      ? body.rentalCars
          .filter((line): line is string => typeof line === 'string' && line.length > 0)
          .slice(0, 10)
          .map((line) => line.slice(0, 120))
      : undefined,
    visitedLandmarks: Array.isArray(body.visitedLandmarks)
      ? body.visitedLandmarks
          .filter((name): name is string => typeof name === 'string' && name.length > 0)
          .slice(0, MAX_NEARBY_LANDMARKS)
          .map((name) => name.slice(0, 80))
      : undefined,
  });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': GEMINI_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: toGeminiContents(history),
          generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            // Chat replies don't need extended reasoning — thinking can
            // silently consume the whole output token budget before any
            // visible text is produced (see file header). Gemini 3.x
            // replaced the numeric thinkingBudget (2.5-era) with a string
            // thinkingLevel enum (minimal/low/medium/high) — sending the
            // old field name 400s with a generic "invalid argument".
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      console.error('Guardian: Gemini API error', geminiRes.status, detail);
      return jsonResponse({ error: 'Guardian could not respond right now.' }, 502);
    }

    const data = await geminiRes.json();

    if (data.promptFeedback?.blockReason) {
      console.error('Guardian: prompt blocked by Gemini', data.promptFeedback.blockReason);
      return jsonResponse({ error: 'Guardian could not respond right now.' }, 502);
    }

    const candidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;
    const parts: Array<{ text?: string }> = candidate?.content?.parts ?? [];
    const rawReply = parts
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();

    if (!rawReply) {
      console.error(
        'Guardian: unexpected Gemini response shape',
        JSON.stringify(data),
        'finishReason:',
        candidate?.finishReason,
      );
      return jsonResponse({ error: 'Guardian could not respond right now.' }, 502);
    }

    const { reply, places } = extractPlaces(rawReply);
    return jsonResponse({ reply, places }, 200);
  } catch (err) {
    console.error('Guardian: request failed', err);
    return jsonResponse({ error: 'Guardian could not respond right now.' }, 502);
  }
});
