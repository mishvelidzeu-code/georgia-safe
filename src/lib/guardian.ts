import { supabase } from './supabase';
import type { GuardianContext } from './guardianContext';
import type { LanguageCode } from '../i18n/LanguageContext';

export type GuardianPlace = { name: string; query: string };

export type GuardianChatTurn = { role: 'user' | 'assistant'; content: string };

export type GuardianResult =
  | { ok: true; reply: string; places: GuardianPlace[] }
  // `limitReached` separates "you've used your free questions" from every other
  // failure, so the UI can open the paywall instead of showing an error.
  | { ok: false; limitReached?: boolean };

// Matches MAX_HISTORY in supabase/functions/guardian/index.ts — capping on
// both sides keeps the request small (cost guard) even if one side drifts.
const MAX_HISTORY = 12;

/**
 * Calls the "guardian" Supabase Edge Function (v2) with the recent chat
 * history (so Guardian remembers the conversation) plus optional safety
 * context (nearest zone, time of day — see src/lib/guardianContext.ts).
 *
 * Returns the reply text and any places Guardian recommended — each place
 * has a `query` the UI can open in Google Maps as a tappable directions
 * chip.
 *
 * Never throws — offline, a misconfigured client, or a server-side error
 * all resolve to `{ ok: false }` so the chat UI shows one friendly fallback
 * message instead of crashing or leaking a raw error.
 */
export async function askGuardian(
  history: GuardianChatTurn[],
  language: LanguageCode,
  context?: GuardianContext,
): Promise<GuardianResult> {
  if (!supabase) return { ok: false };

  try {
    const { data, error } = await supabase.functions.invoke('guardian', {
      body: {
        messages: history.slice(-MAX_HISTORY),
        // The chosen app language, not a guess from the text — see the server
        // for why guessing left the chat stuck in the previous language.
        language,
        city: context?.city,
        firstName: context?.firstName,
        homeCountry: context?.homeCountry,
        visitNumber: context?.visitNumber,
        visitLength: context?.visitLength,
        ageBand: context?.ageBand,
        rentalCars: context?.rentalCars,
        zoneName: context?.zoneName,
        zoneLevel: context?.zoneLevel,
        timeOfDay: context?.timeOfDay,
        nearbyLandmarks: context?.nearbyLandmarks,
        visitedLandmarks: context?.visitedLandmarks,
      },
    });

    if (error) {
      // The function returns 402 with `error: 'limit_reached'` once the free
      // allowance is spent. supabase-js surfaces non-2xx as an error, so the
      // body has to be read off the response to tell the two cases apart.
      const status = (error as { context?: { status?: number } })?.context?.status;
      if (status === 402) return { ok: false, limitReached: true };

      // Surfaced only to the Metro/dev console (never to the tourist) so a
      // real failure can be diagnosed instead of guessed at.
      console.error('Guardian invoke() returned an error:', JSON.stringify(error, null, 2));
      return { ok: false };
    }

    const payload = data as { reply?: unknown; places?: unknown } | null;
    const reply = payload?.reply;
    if (typeof reply !== 'string' || !reply) {
      console.error('Guardian invoke() returned no reply. data:', JSON.stringify(data));
      return { ok: false };
    }

    const places: GuardianPlace[] = Array.isArray(payload?.places)
      ? payload.places.filter(
          (item): item is GuardianPlace =>
            !!item && typeof item.name === 'string' && typeof item.query === 'string',
        )
      : [];

    return { ok: true, reply, places };
  } catch (err) {
    console.error('Guardian invoke() threw:', err);
    return { ok: false };
  }
}
