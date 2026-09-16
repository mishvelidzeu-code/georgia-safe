import AsyncStorage from '@react-native-async-storage/async-storage';

const SELECTED_COUNTRY_KEY = 'georgia_safe_selected_country_id';
const TRUSTED_CONTACT_KEY = 'georgia_safe_trusted_contact';
const EVENING_NUDGE_DATE_KEY = 'georgia_safe_evening_nudge_date';
const VISITED_LANDMARKS_KEY = 'georgia_safe_visited_landmark_ids';
const ONBOARDING_DONE_KEY = 'georgia_safe_onboarding_done';
const GUEST_MODE_KEY = 'georgia_safe_guest_mode';
const FAB_OFFSET_KEY_PREFIX = 'georgia_safe_fab_offset_';
const GUARDIAN_CHAT_KEY = 'georgia_safe_guardian_chat';
const PROFILE_CACHE_KEY = 'georgia_safe_profile_cache';
const GUARDIAN_INTRO_KEY = 'georgia_safe_guardian_intro_seen';

/**
 * Whether the assistant has already introduced itself. Drives the red badge on
 * the mascot and the one-time welcome message — both should appear exactly
 * once, not on every fresh conversation.
 */
export async function hasSeenGuardianIntro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GUARDIAN_INTRO_KEY)) === 'true';
  } catch {
    // Treat a storage failure as "already seen" so a broken read can't nag.
    return true;
  }
}

export async function setGuardianIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(GUARDIAN_INTRO_KEY, 'true');
  } catch {
    // Worst case the intro shows again next launch.
  }
}

const LAYERS_INTRO_KEY = 'georgia_safe_layers_intro_seen';

/**
 * Whether the tourist has opened the map's layers panel at least once. Drives
 * the "1" badge on the layers button — the same nudge as the assistant's,
 * for the same reason: the panel is easy to miss and hides half the map.
 */
export async function hasSeenLayersIntro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LAYERS_INTRO_KEY)) === 'true';
  } catch {
    // Treat a storage failure as "already seen" so a broken read can't nag.
    return true;
  }
}

export async function setLayersIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAYERS_INTRO_KEY, 'true');
  } catch {
    // Worst case the badge shows again next launch.
  }
}

/**
 * The handful of onboarding answers Guardian uses to tailor advice. Cached
 * locally so opening the chat never waits on a network round trip — and still
 * works offline, which is when a lost tourist most needs it.
 */
export type CachedProfile = {
  firstName?: string;
  country?: string;
  visitNumber?: number;
  visitLength?: string;
  // A bracket, never the exact age — enough for Guardian to know whether
  // nightlife, alcohol or renting a car are even options, without the real
  // number leaving the phone.
  ageBand?: AgeBand;
};

export type AgeBand = 'under18' | '18-20' | '21-23' | '24plus';

export async function getCachedProfile(): Promise<CachedProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as CachedProfile) : null;
  } catch {
    return null;
  }
}

export async function setCachedProfile(profile: CachedProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Guardian just falls back to advice without the trip details.
  }
}

/**
 * How long a saved Guardian conversation stays readable. One day: long enough
 * that closing the app mid-outing doesn't lose the thread, short enough that a
 * chat mentioning where someone felt unsafe isn't sitting on the phone
 * indefinitely. Guardian also reads location and time at open, so replaying a
 * days-old conversation would feed it stale context anyway.
 */
export const GUARDIAN_CHAT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Loads the saved conversation, or null if there is none or it has expired.
 * Expired chats are deleted on read, so nothing lingers once it is stale.
 */
export async function getSavedGuardianChat<T>(): Promise<T[] | null> {
  try {
    const raw = await AsyncStorage.getItem(GUARDIAN_CHAT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { savedAt?: unknown }).savedAt !== 'number' ||
      !Array.isArray((parsed as { messages?: unknown }).messages)
    ) {
      return null;
    }
    const { savedAt, messages } = parsed as { savedAt: number; messages: T[] };
    if (Date.now() - savedAt > GUARDIAN_CHAT_TTL_MS) {
      await AsyncStorage.removeItem(GUARDIAN_CHAT_KEY);
      return null;
    }
    return messages;
  } catch {
    return null;
  }
}

export async function saveGuardianChat<T>(messages: T[]): Promise<void> {
  try {
    if (messages.length === 0) {
      await AsyncStorage.removeItem(GUARDIAN_CHAT_KEY);
      return;
    }
    await AsyncStorage.setItem(
      GUARDIAN_CHAT_KEY,
      JSON.stringify({ savedAt: Date.now(), messages }),
    );
  } catch {
    // Chat just won't survive a restart — never worth interrupting the user.
  }
}

export async function clearGuardianChat(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GUARDIAN_CHAT_KEY);
  } catch {
    // Nothing to do — the in-memory conversation is cleared either way.
  }
}

const MAP_LAYERS_KEY = 'georgia_safe_map_layers';

/**
 * Which map layers the tourist switched off in the layers panel. Persisted so
 * a choice like "no police pins" survives closing the app — the panel is a
 * setting, not a one-session toggle. Unknown keys are simply ignored on read,
 * so adding a layer later never breaks an older saved value.
 */
export type MapLayerPrefs = {
  zones: boolean;
  landmarks: boolean;
  places: Record<string, boolean>;
  partners: Record<string, boolean>;
};

export async function getMapLayerPrefs(): Promise<MapLayerPrefs | null> {
  try {
    const raw = await AsyncStorage.getItem(MAP_LAYERS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    const flags = (input: unknown): Record<string, boolean> =>
      input && typeof input === 'object'
        ? Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>
        : {};
    return {
      zones: value.zones !== false,
      landmarks: value.landmarks !== false,
      places: flags(value.places),
      partners: flags(value.partners),
    };
  } catch {
    return null;
  }
}

export async function setMapLayerPrefs(prefs: MapLayerPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(MAP_LAYERS_KEY, JSON.stringify(prefs));
  } catch {
    // Worst case the layers reset to defaults next launch.
  }
}

/**
 * How far a floating button has been dragged from its default corner, in
 * points. Stored per button id so SOS and Guardian move independently.
 */
export type FabOffset = { x: number; y: number };

export async function getFabOffset(id: string): Promise<FabOffset | null> {
  try {
    const raw = await AsyncStorage.getItem(FAB_OFFSET_KEY_PREFIX + id);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as FabOffset).x === 'number' &&
      typeof (parsed as FabOffset).y === 'number'
    ) {
      return parsed as FabOffset;
    }
    return null;
  } catch {
    // Corrupt value — fall back to the default position rather than crashing
    // on a button the tourist may need in an emergency.
    return null;
  }
}

export async function setFabOffset(id: string, offset: FabOffset): Promise<void> {
  try {
    await AsyncStorage.setItem(FAB_OFFSET_KEY_PREFIX + id, JSON.stringify(offset));
  } catch {
    // Position just won't persist to the next launch — not worth surfacing.
  }
}

export type TrustedContact = {
  name: string;
  phone: string;
};

export async function getSelectedCountryId(): Promise<string | null> {
  return AsyncStorage.getItem(SELECTED_COUNTRY_KEY);
}

export async function setSelectedCountryId(id: string): Promise<void> {
  await AsyncStorage.setItem(SELECTED_COUNTRY_KEY, id);
}

const SELECTED_RENTAL_CITY_KEY = 'georgia_safe_rental_city';

/** The city chosen on Getting Around's car list; null means "all cities". */
export async function getSelectedRentalCity(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SELECTED_RENTAL_CITY_KEY);
  } catch {
    return null;
  }
}

export async function setSelectedRentalCity(city: string | null): Promise<void> {
  try {
    if (city) await AsyncStorage.setItem(SELECTED_RENTAL_CITY_KEY, city);
    else await AsyncStorage.removeItem(SELECTED_RENTAL_CITY_KEY);
  } catch {
    // Not remembering the filter is harmless.
  }
}

export async function getTrustedContact(): Promise<TrustedContact | null> {
  const raw = await AsyncStorage.getItem(TRUSTED_CONTACT_KEY);
  return raw ? (JSON.parse(raw) as TrustedContact) : null;
}

export async function setTrustedContact(contact: TrustedContact): Promise<void> {
  await AsyncStorage.setItem(TRUSTED_CONTACT_KEY, JSON.stringify(contact));
}

/**
 * Returns true only the first time it's called on a given calendar day (local
 * date, YYYY-MM-DD) — used to gate the evening zone notification/Live
 * Activity to once per day. Durable across app reloads/relaunches, unlike a
 * plain in-memory flag: a bug fix for the notification firing again on every
 * JS reload (e.g. Fast Refresh during dev, or the app being relaunched)
 * instead of just once per evening. Never throws — on any storage failure it
 * returns true (fires the nudge) rather than silently suppressing it forever.
 */
export async function shouldSendEveningNudgeToday(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, good enough for a once-a-day gate
  try {
    const lastSent = await AsyncStorage.getItem(EVENING_NUDGE_DATE_KEY);
    if (lastSent === today) return false;
    await AsyncStorage.setItem(EVENING_NUDGE_DATE_KEY, today);
    return true;
  } catch {
    return true;
  }
}

/**
 * Whether the tourist has finished onboarding. Kept locally (not only
 * server-side) so a returning user with no network still goes straight into
 * the app instead of being trapped on the sign-up step.
 */
export async function isOnboardingDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_DONE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingDone(done: boolean): Promise<void> {
  try {
    if (done) await AsyncStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    else await AsyncStorage.removeItem(ONBOARDING_DONE_KEY);
  } catch {
    // Non-critical: worst case the tourist sees onboarding once more.
  }
}

/**
 * Guest mode: the tourist chose "look around first" on the welcome screen and
 * is using the app with no account. Stored separately from the onboarding
 * flag, because the two mean different things — one is "she has an account
 * on this phone", the other is "she explicitly declined to make one" — and
 * the app has to be able to end guest mode without claiming onboarding was
 * completed.
 */
export async function isGuestMode(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GUEST_MODE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setGuestMode(guest: boolean): Promise<void> {
  try {
    if (guest) await AsyncStorage.setItem(GUEST_MODE_KEY, 'true');
    else await AsyncStorage.removeItem(GUEST_MODE_KEY);
  } catch {
    // Non-critical: worst case they land on the welcome screen again.
  }
}

/**
 * Landmark "visited" tracking (arrival geofencing, see landmarkGeofencing.ts).
 * A plain array is stored (not a Set — AsyncStorage/JSON can't hold one).
 */
export async function getVisitedLandmarkIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(VISITED_LANDMARKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Marks a landmark visited (idempotent). Returns true only the first time —
 * used by the geofencing task to decide whether to fire the arrival
 * notification (so re-entering the same region twice doesn't notify twice).
 */
export async function addVisitedLandmarkId(id: string): Promise<boolean> {
  try {
    const current = await getVisitedLandmarkIds();
    if (current.includes(id)) return false;
    await AsyncStorage.setItem(VISITED_LANDMARKS_KEY, JSON.stringify([...current, id]));
    return true;
  } catch {
    return false;
  }
}

/**
 * Undoes the above (idempotent) — the tourist can correct the map by hand
 * from the landmark sheet, e.g. when they only drove past a place and the
 * geofence marked it visited anyway.
 */
export async function removeVisitedLandmarkId(id: string): Promise<void> {
  try {
    const current = await getVisitedLandmarkIds();
    if (!current.includes(id)) return;
    await AsyncStorage.setItem(
      VISITED_LANDMARKS_KEY,
      JSON.stringify(current.filter((visitedId) => visitedId !== id)),
    );
  } catch {
    // Non-critical: the pin keeps its current look until the next attempt.
  }
}
