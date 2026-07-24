import * as Location from 'expo-location';
import zonesData from '../data/zones.json';

export type ZoneLevel = 'green' | 'yellow' | 'red';
export type TimeOfDay = 'day' | 'night';

export type GuardianContext = {
  zoneName?: string;
  zoneLevel?: ZoneLevel;
  timeOfDay: TimeOfDay;
};

type Zone = {
  id: string;
  name_en: string;
  day_level: ZoneLevel;
  night_level: ZoneLevel;
  lat: number;
  lng: number;
};

const zones = zonesData as Zone[];

// If the tourist is farther than this from every known zone center, we omit
// zone context entirely rather than attribute them to a misleadingly
// "nearest" but actually-irrelevant zone. Zones render as 800m circles on
// the map, so 1.5km ≈ "in or right next to" a zone; the original 5km cap
// caused a real misattribution bug (a user in then-unmapped Dighomi Massive
// was told they were "in Didube", ~2km away).
const NEAREST_ZONE_MAX_KM = 1.5;

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

async function findNearestZone(): Promise<Zone | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const position = await Location.getCurrentPositionAsync({});
    let nearest: Zone | null = null;
    let nearestDistanceKm = Infinity;

    for (const zone of zones) {
      const distanceKm = haversineKm(
        position.coords.latitude,
        position.coords.longitude,
        zone.lat,
        zone.lng,
      );
      if (distanceKm < nearestDistanceKm) {
        nearestDistanceKm = distanceKm;
        nearest = zone;
      }
    }

    return nearest && nearestDistanceKm <= NEAREST_ZONE_MAX_KM ? nearest : null;
  } catch {
    // Permission denied, location services off, timeout, etc. — Guardian
    // still works, just without zone context.
    return null;
  }
}

/**
 * Best-effort safety context for Guardian: the nearest known zone (if the
 * tourist is within ~5km of one and has granted location permission) plus
 * the current time of day. Never throws — on any failure, `zoneName`/
 * `zoneLevel` are simply omitted and Guardian answers generically instead.
 */
export async function getGuardianContext(): Promise<GuardianContext> {
  const timeOfDay = currentTimeOfDay();
  const nearestZone = await findNearestZone();

  if (!nearestZone) return { timeOfDay };

  return {
    timeOfDay,
    zoneName: nearestZone.name_en,
    zoneLevel: timeOfDay === 'night' ? nearestZone.night_level : nearestZone.day_level,
  };
}
