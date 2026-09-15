import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { LanguageCode } from '../i18n/LanguageContext';

// Admin-marked, time-limited warning circles — see
// supabase/migrations/20260915140000_risk_zones.sql. Everywhere that is not
// inside one of these is simply unmarked; the app never claims an area is
// "safe", only that it has no known warning.

export type RiskLevel = 'orange' | 'red';
export type RiskZoneSize = 'small' | 'medium' | 'large';

export const RISK_ZONE_SIZES: RiskZoneSize[] = ['small', 'medium', 'large'];
export const RISK_ZONE_RADII: Record<RiskZoneSize, number> = { small: 200, medium: 400, large: 800 };

export type RiskZone = {
  id: string;
  level: RiskLevel;
  lat: number;
  lng: number;
  radiusM: number;
  comment_en: string;
  comment_ka: string;
  comment_ru: string;
  startsAt: string;
  expiresAt: string;
};

export type RiskZoneInput = {
  level: RiskLevel;
  lat: number;
  lng: number;
  radiusM: number;
  comment_en: string;
  comment_ka: string;
  comment_ru: string;
  /** Hours from the moment of saving. */
  durationHours: number;
};

const CACHE_KEY = 'georgia_safe_risk_zones';

function toRiskZone(row: Record<string, unknown>): RiskZone {
  return {
    id: String(row.id),
    level: row.level === 'red' ? 'red' : 'orange',
    lat: Number(row.lat),
    lng: Number(row.lng),
    radiusM: Number(row.radius_m),
    comment_en: typeof row.comment_en === 'string' ? row.comment_en : '',
    comment_ka: typeof row.comment_ka === 'string' ? row.comment_ka : '',
    comment_ru: typeof row.comment_ru === 'string' ? row.comment_ru : '',
    startsAt: String(row.starts_at),
    expiresAt: String(row.expires_at),
  };
}

export function isRiskZoneActive(zone: RiskZone, now = Date.now()): boolean {
  const expires = Date.parse(zone.expiresAt);
  return Number.isFinite(expires) && expires > now;
}

/** Comment in the app language, falling back to whichever language the admin filled in. */
export function riskZoneComment(zone: RiskZone, language: LanguageCode): string {
  return zone[`comment_${language}`] || zone.comment_en || zone.comment_ka || zone.comment_ru;
}

export function sizeForRadius(radiusM: number): RiskZoneSize {
  const match = RISK_ZONE_SIZES.find((size) => RISK_ZONE_RADII[size] === radiusM);
  return match ?? 'medium';
}

// ---------------------------------------------------------------------------
// Reading (tourist side)
// ---------------------------------------------------------------------------

/**
 * Last successfully fetched zones, so the map still shows warnings without a
 * connection. Anything that has expired since is dropped on read — the cache
 * must never resurrect a warning the server would no longer serve.
 */
export async function getCachedRiskZones(): Promise<RiskZone[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RiskZone => {
        if (!item || typeof item !== 'object') return false;
        const value = item as Record<string, unknown>;
        return typeof value.id === 'string'
          && typeof value.lat === 'number'
          && typeof value.lng === 'number'
          && typeof value.radiusM === 'number'
          && typeof value.expiresAt === 'string';
      })
      .filter((zone) => isRiskZoneActive(zone));
  } catch {
    return [];
  }
}

async function cacheRiskZones(zones: RiskZone[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(zones));
  } catch {
    // The cache is an offline convenience — a failed write costs nothing now.
  }
}

/** Active zones from the server (RLS already hides expired rows); caches on success. */
export async function fetchRiskZones(): Promise<RiskZone[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('risk_zones')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true });
  if (error) throw error;
  const zones = (data ?? []).map((row) => toRiskZone(row as Record<string, unknown>));
  await cacheRiskZones(zones);
  return zones;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** The zone a point falls inside, red winning over orange when circles overlap. */
export function findRiskZoneAt(lat: number, lng: number, zones: RiskZone[]): RiskZone | null {
  let found: RiskZone | null = null;
  for (const zone of zones) {
    if (distanceMeters(lat, lng, zone.lat, zone.lng) > zone.radiusM) continue;
    if (!found || (zone.level === 'red' && found.level !== 'red')) found = zone;
  }
  return found;
}

export type NearestRiskZone = { zone: RiskZone; distanceM: number; inside: boolean };

/** Nearest zone by distance to its edge (0 when inside), or null when none is within maxDistanceM. */
export function findNearestRiskZone(
  lat: number,
  lng: number,
  zones: RiskZone[],
  maxDistanceM: number,
): NearestRiskZone | null {
  let best: NearestRiskZone | null = null;
  for (const zone of zones) {
    const edge = Math.max(0, distanceMeters(lat, lng, zone.lat, zone.lng) - zone.radiusM);
    if (edge > maxDistanceM) continue;
    if (!best || edge < best.distanceM) best = { zone, distanceM: Math.round(edge), inside: edge === 0 };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Writing (admin only — every call is re-checked by RLS)
// ---------------------------------------------------------------------------

function expiresFrom(durationHours: number): string {
  return new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
}

export async function createRiskZone(input: RiskZoneInput): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('risk_zones').insert({
    level: input.level,
    lat: input.lat,
    lng: input.lng,
    radius_m: input.radiusM,
    comment_en: input.comment_en.trim(),
    comment_ka: input.comment_ka.trim(),
    comment_ru: input.comment_ru.trim(),
    starts_at: new Date().toISOString(),
    expires_at: expiresFrom(input.durationHours),
  });
  return !error;
}

/**
 * Edits an existing zone. A duration restarts the clock from now (the admin
 * is deliberately re-deciding how long the warning should stay up); leaving
 * it undefined keeps the current expiry.
 */
export async function updateRiskZone(
  id: string,
  patch: Partial<Omit<RiskZoneInput, 'durationHours'>> & { durationHours?: number },
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('risk_zones')
    .update({
      ...(patch.level && { level: patch.level }),
      ...(patch.lat !== undefined && { lat: patch.lat }),
      ...(patch.lng !== undefined && { lng: patch.lng }),
      ...(patch.radiusM !== undefined && { radius_m: patch.radiusM }),
      ...(patch.comment_en !== undefined && { comment_en: patch.comment_en.trim() }),
      ...(patch.comment_ka !== undefined && { comment_ka: patch.comment_ka.trim() }),
      ...(patch.comment_ru !== undefined && { comment_ru: patch.comment_ru.trim() }),
      ...(patch.durationHours !== undefined && {
        starts_at: new Date().toISOString(),
        expires_at: expiresFrom(patch.durationHours),
      }),
    })
    .eq('id', id);
  return !error;
}

export async function deleteRiskZone(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('risk_zones').delete().eq('id', id);
  return !error;
}
