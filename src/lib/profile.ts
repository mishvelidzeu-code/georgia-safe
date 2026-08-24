import { supabase } from './supabase';
import { getCachedProfile, setCachedProfile, setSelectedCountryId } from './storage';
import type { AgeBand, CachedProfile } from './storage';
import { findCountry } from './countries';

// The tourist's own onboarding profile (see the profiles table migration).
// Collected across the onboarding steps, then written once the account
// exists. Reads/writes are per-user only — RLS enforces that server-side.

export type VisitLength = 'days' | 'week' | 'weeks' | 'month' | 'longer';

export const VISIT_LENGTHS: VisitLength[] = ['days', 'week', 'weeks', 'month', 'longer'];

export type OnboardingDraft = {
  countryId?: string;
  fullName?: string;
  visitLength?: VisitLength;
  visitNumber?: number;
  age?: number;
};

export type Profile = {
  id: string;
  countryId: string | null;
  fullName: string | null;
  visitLength: VisitLength | null;
  visitNumber: number | null;
  age: number | null;
};

/**
 * Writes the collected onboarding answers to the signed-in user's profile.
 * Upsert (not insert) so finishing onboarding twice — e.g. after the account
 * was created but the first profile write failed — repairs the row instead of
 * erroring on the primary key.
 *
 * Also mirrors the chosen country into the existing local storage key the
 * Emergency and Profile screens already read, so the embassy shown there is
 * the one picked during onboarding — one source of truth, not two.
 *
 * Never throws: returns false so the caller can show a retry instead of
 * crashing mid-onboarding.
 */
export async function saveOnboardingProfile(draft: OnboardingDraft): Promise<boolean> {
  if (draft.countryId) {
    // Local mirror first — this part works even with no network, so the
    // Emergency screen is correct regardless of what the server says.
    await setSelectedCountryId(draft.countryId).catch(() => {});
  }

  // Second local mirror, for Guardian. Written before the network call so the
  // assistant knows the trip details even if the upsert below fails.
  await cacheProfileForGuardian({
    fullName: draft.fullName ?? null,
    countryId: draft.countryId ?? null,
    visitLength: draft.visitLength ?? null,
    visitNumber: draft.visitNumber ?? null,
    age: draft.age ?? null,
  }).catch(() => {});

  if (!supabase) return false;

  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return false;

    const { error } = await supabase.from('profiles').upsert(
      {
        id: userId,
        country_id: draft.countryId ?? null,
        full_name: draft.fullName ?? null,
        visit_length: draft.visitLength ?? null,
        visit_number: draft.visitNumber ?? null,
        age: draft.age ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    return !error;
  } catch {
    return false;
  }
}

/**
 * Buckets an exact age into the brackets that actually change advice: whether
 * someone can drink or get into a club at all (18 in Georgia), whether the
 * 21+ venues are open to them, and whether car hire is realistic (usually 23-25
 * and often surcharged below that).
 *
 * The exact number never leaves the phone — only which bracket it falls in.
 */
function toAgeBand(age: number | null): AgeBand | undefined {
  if (typeof age !== 'number' || !Number.isFinite(age)) return undefined;
  if (age < 18) return 'under18';
  if (age < 21) return '18-20';
  if (age < 24) return '21-23';
  return '24plus';
}

/**
 * Mirrors the trip details Guardian uses into local storage.
 *
 * Deliberately a subset: first name, country, how long they're staying, which
 * visit this is, and an age BRACKET — never the exact age.
 */
async function cacheProfileForGuardian(profile: {
  fullName: string | null;
  countryId: string | null;
  visitLength: VisitLength | null;
  visitNumber: number | null;
  age: number | null;
}): Promise<void> {
  const ageBand = toAgeBand(profile.age);
  const country = findCountry(profile.countryId);
  await setCachedProfile({
    // First name only — enough to be personable, and the assistant has no use
    // for a full legal name.
    ...(profile.fullName && { firstName: profile.fullName.trim().split(/\s+/)[0] }),
    ...(country && { country: country.name_en }),
    ...(profile.visitLength && { visitLength: profile.visitLength }),
    ...(typeof profile.visitNumber === 'number' && { visitNumber: profile.visitNumber }),
    ...(ageBand && { ageBand }),
  });
}

/**
 * Trip details for Guardian: the local cache if present, otherwise fetched
 * once from the server and cached. Returns null when there's nothing to say —
 * Guardian then answers without personalising, exactly as before.
 */
export async function getProfileForGuardian(): Promise<CachedProfile | null> {
  const cached = await getCachedProfile();
  if (cached) return cached;

  const profile = await fetchMyProfile();
  if (!profile) return null;

  await cacheProfileForGuardian({
    fullName: profile.fullName,
    countryId: profile.countryId,
    visitLength: profile.visitLength,
    visitNumber: profile.visitNumber,
    age: profile.age,
  });
  return getCachedProfile();
}

/** Returns the signed-in user's profile, or null if there isn't one yet. */
export async function fetchMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, country_id, full_name, visit_length, visit_number, age')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;

    return {
      id: String(data.id),
      countryId: typeof data.country_id === 'string' ? data.country_id : null,
      fullName: typeof data.full_name === 'string' ? data.full_name : null,
      visitLength: (VISIT_LENGTHS as string[]).includes(data.visit_length)
        ? (data.visit_length as VisitLength)
        : null,
      visitNumber: typeof data.visit_number === 'number' ? data.visit_number : null,
      age: typeof data.age === 'number' ? data.age : null,
    };
  } catch {
    return null;
  }
}
