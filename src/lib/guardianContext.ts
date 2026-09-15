import * as Location from 'expo-location';
import landmarksData from '../data/landmarks.json';
import { getVisitedLandmarkIds } from './storage';
import { findNearestRiskZone, getCachedRiskZones, riskZoneComment } from './riskZones';
import type { RiskLevel } from './riskZones';
import { getProfileForGuardian } from './profile';
import { fetchRentalCars } from './rentals';
import { isInsideGeorgia } from './geography';

export type TimeOfDay = 'day' | 'night';

export type GuardianContext = {
  // The town or city the tourist is in, from the OS reverse geocoder.
  // Zones only exist for Tbilisi districts, so without this Guardian had no
  // idea where someone in Batumi or Kutaisi was and had to ask them.
  city?: string;
  // The admin-marked risk zone the tourist is inside of, or the closest one
  // within NEAREST_RISK_ZONE_MAX_M. Read from the map's offline cache, so it
  // costs no network call and works without one.
  riskZone?: GuardianRiskZone;
  timeOfDay: TimeOfDay;
  // English names of the landmarks the app actually has pins for near the
  // tourist right now. Sent so Guardian recommends places the user can then
  // find on our own map, instead of arbitrary ones from its training data.
  // Deliberately nearest-only (not all 97) — a tourist in Batumi has no use
  // for Kakheti's list, and it keeps the per-message token cost negligible.
  nearbyLandmarks?: string[];
  // Nearby landmarks the tourist has already been to — the ones the map draws
  // small and grey. Sent so Guardian stops recommending places they've already
  // seen. Comes from the same AsyncStorage list the arrival geofencing writes,
  // so it needs no extra permission and no server-side history of anyone.
  visitedLandmarks?: string[];
  // Trip details from onboarding — see profile.ts for what is deliberately
  // left out (age never leaves the device).
  firstName?: string;
  homeCountry?: string;
  visitNumber?: number;
  visitLength?: string;
  // Bracket only — the exact age never leaves the device (see profile.ts).
  ageBand?: string;
  // Rental cars available from approved partners in this city, as short
  // summaries. Phone numbers are deliberately NOT included — see
  // describeRentalCars below.
  rentalCars?: string[];
};

export type GuardianRiskZone = {
  /** Lets the banner look the zone up in the cache for a localized comment. */
  id: string;
  level: RiskLevel;
  /** English comment — the prompt is English; Guardian answers in the app language anyway. */
  comment: string;
  /** Metres to the circle's edge; 0 when inside. */
  distanceM: number;
  inside: boolean;
};

type Landmark = { id: string; name_en: string; lat: number; lng: number };

const landmarks = landmarksData as Landmark[];

// A risk zone farther than this from the tourist is not worth mentioning:
// Guardian should warn about the incident down the street, not one across
// town (the old district model once told a user in Dighomi they were "in
// Didube", 2km away — the same mistake in a different shape).
const NEAREST_RISK_ZONE_MAX_M = 1000;

// Landmarks are a day-trip concept, not a "where am I standing" one, so this
// radius is far wider than the zone one — wide enough to cover day trips from
// any base city (e.g. Tbilisi → Mtskheta/Kakheti), narrow enough to exclude
// the other end of the country.
const NEARBY_LANDMARK_MAX_KM = 120;
const MAX_NEARBY_LANDMARKS = 15;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

/** 22:00-05:59 counts as night, matching the "22:00+" threshold used elsewhere in the plan (gegma.txt 5.4). */
export function currentTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6 ? 'night' : 'day';
}

/**
 * Evening threshold for the map's safety-zone overlay: zones stay hidden by
 * day (the map is clean for sightseeing) and switch on automatically from
 * 19:00 through the night until 06:00 — the window when a solo traveller most
 * needs to see which areas to avoid. Deliberately separate from
 * currentTimeOfDay()'s 22:00 "night" cutoff, which only controls zone colors.
 */
export function isEveningOrLater(): boolean {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 6;
}

/**
 * City/town name from the OS geocoder. Free, no API key, and handled by the
 * platform rather than a network call we control — so it is wrapped in its own
 * try/catch and simply omitted when it fails, rather than costing us the rest
 * of the context.
 */
async function findCity(lat: number, lng: number): Promise<string | undefined> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return place?.city ?? place?.subregion ?? place?.region ?? undefined;
  } catch {
    return undefined;
  }
}

// Enough for Guardian to answer "what can I rent here" without turning the
// prompt (and the per-message cost) into a catalogue.
const MAX_RENTAL_CARS = 10;

/**
 * Short summaries of the rental cars actually listed in this city.
 *
 * Contact numbers are left out on purpose. A model that garbles one digit
 * sends a tourist to a stranger, so Guardian is told to point them at the
 * Getting Around tab, where the real number sits behind a call button that
 * cannot be misremembered.
 */
async function describeRentalCars(city?: string): Promise<string[]> {
  try {
    const cars = await fetchRentalCars(city);
    return cars.slice(0, MAX_RENTAL_CARS).map((car) => {
      const parts = [
        `${car.make} ${car.model}`,
        car.year ? String(car.year) : null,
        car.transmission,
        car.seats ? `${car.seats} seats` : null,
        car.pricePerDay !== null ? `${car.pricePerDay} GEL/day` : null,
        `from ${car.companyName}`,
      ].filter(Boolean);
      return parts.join(', ');
    });
  } catch {
    // Offline or nothing listed — Guardian just answers without specifics.
    return [];
  }
}

async function findRiskZone(lat: number, lng: number): Promise<GuardianRiskZone | undefined> {
  const nearest = findNearestRiskZone(lat, lng, await getCachedRiskZones(), NEAREST_RISK_ZONE_MAX_M);
  if (!nearest) return undefined;
  return {
    id: nearest.zone.id,
    level: nearest.zone.level,
    comment: riskZoneComment(nearest.zone, 'en'),
    distanceM: nearest.distanceM,
    inside: nearest.inside,
  };
}

/**
 * Nearby landmarks split by whether the tourist has already been there.
 *
 * The visited list is taken first and does not eat into the unvisited quota:
 * someone on day three of a trip may have seen most of what is close by, and
 * the point of sending it is precisely so Guardian suggests something else.
 */
function findNearbyLandmarks(
  lat: number,
  lng: number,
  visitedIds: Set<string>,
): { unvisited: string[]; visited: string[] } {
  const near = landmarks
    .map((l) => ({ id: l.id, name: l.name_en, km: haversineKm(lat, lng, l.lat, l.lng) }))
    .filter(({ km }) => km <= NEARBY_LANDMARK_MAX_KM)
    .sort((a, b) => a.km - b.km);

  return {
    unvisited: near
      .filter((l) => !visitedIds.has(l.id))
      .slice(0, MAX_NEARBY_LANDMARKS)
      .map(({ name }) => name),
    visited: near
      .filter((l) => visitedIds.has(l.id))
      .slice(0, MAX_NEARBY_LANDMARKS)
      .map(({ name }) => name),
  };
}

/**
 * Best-effort context for Guardian: the risk zone the tourist is in or next
 * to (if any, and if they granted location permission), the landmarks our
 * map has pins for around them, and the current time of day.
 * Never throws — on any failure the location-derived fields are simply
 * omitted and Guardian answers generically instead.
 */
export async function getGuardianContext(
  // GettingAroundScreen already loads the full car objects itself, so it opts
  // out rather than making the same query twice on one screen.
  { includeRentals = true }: { includeRentals?: boolean } = {},
): Promise<GuardianContext> {
  const timeOfDay = currentTimeOfDay();
  // Read first and reused on both paths below: the trip details are useful
  // even when location is denied, which is exactly when Guardian has least
  // else to go on.
  const profile = (await getProfileForGuardian().catch(() => null)) ?? {};
  const profileFields = {
    ...(profile.firstName && { firstName: profile.firstName }),
    ...(profile.country && { homeCountry: profile.country }),
    ...(profile.visitNumber && { visitNumber: profile.visitNumber }),
    ...(profile.visitLength && { visitLength: profile.visitLength }),
    ...(profile.ageBand && { ageBand: profile.ageBand }),
  };

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { timeOfDay, ...profileFields };

    const position = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = position.coords;

    // The city is only looked up inside Georgia. Outside it the reverse
    // geocoder answers with something like "Cupertino", and the server prompt
    // renders that as "currently in Cupertino, Georgia" — a confident lie the
    // assistant then reasons from. No city means the previous, honest
    // behaviour: it simply doesn't claim to know where they are. It also
    // drops the rental-car city filter, which would otherwise match nothing.
    const insideGeorgia = isInsideGeorgia(latitude, longitude);
    const [city, visitedIds, riskZone] = await Promise.all([
      insideGeorgia ? findCity(latitude, longitude) : Promise.resolve(undefined),
      getVisitedLandmarkIds().then((ids) => new Set(ids)),
      findRiskZone(latitude, longitude),
    ]);
    const { unvisited, visited } = findNearbyLandmarks(latitude, longitude, visitedIds);
    const rentalCars = includeRentals ? await describeRentalCars(city) : [];

    return {
      ...(rentalCars.length > 0 && { rentalCars }),
      timeOfDay,
      ...profileFields,
      ...(city && { city }),
      ...(riskZone && { riskZone }),
      ...(unvisited.length > 0 && { nearbyLandmarks: unvisited }),
      ...(visited.length > 0 && { visitedLandmarks: visited }),
    };
  } catch {
    // Permission denied, location services off, timeout, etc. — Guardian
    // still works, just without location context.
    return { timeOfDay, ...profileFields };
  }
}
