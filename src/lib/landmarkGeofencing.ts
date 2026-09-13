import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import landmarksData from '../data/landmarks.json';
import type { LanguageCode } from '../i18n/LanguageContext';
import en from '../i18n/en.json';
import ka from '../i18n/ka.json';
import ru from '../i18n/ru.json';
import { presentLocalNotification, registerForNotificationsAsync } from './notifications';
import { startLandmarkArrivalLiveActivity } from './liveActivity';
import { addVisitedLandmarkId, getVisitedLandmarkIds } from './storage';
import type { PlaceSubmissionCategory } from './placeSubmissions';

// "You've arrived" geofencing for landmarks (see gegma.txt — labels turn
// green→small→gray once visited, still tappable). This works even with the
// app closed/backgrounded (iOS relaunches it briefly to run this task) —
// that's why it needs the "Always" location permission, not just "While
// Using". Region monitoring is native/OS-level (not a JS polling loop), so
// it's battery-cheap regardless of how many regions are registered.
//
// iOS hard-caps simultaneous monitored regions at 20 (CLLocationManager).
// With 90+ landmarks nationwide we can't watch them all at once, so we only
// ever register the nearest MAX_MONITORED_REGIONS *unvisited* landmarks to
// the tourist's last known position, and re-register as they travel (see
// refreshLandmarkGeofences, called on Map mount + periodically).

const GEOFENCE_TASK_NAME = 'landmark-arrival-geofence';
const GEOFENCE_RADIUS_METERS = 70;
const MAX_MONITORED_REGIONS = 20;
const LANGUAGE_STORAGE_KEY = 'georgia_safe_language'; // must match LanguageContext.tsx
const COMMUNITY_ALERTS_STORAGE_KEY = 'georgia_safe_active_alert_geofences';
const COMMUNITY_ALERTS_NOTIFIED_KEY = 'georgia_safe_alert_geofence_notified';
const COMMUNITY_ALERT_PREFIX = 'community-alert:';

type Landmark = {
  id: string;
  lat: number;
  lng: number;
  name_en: string;
  name_ka: string;
  name_ru: string;
};

const landmarks = landmarksData as Landmark[];
const DICTIONARIES: Record<LanguageCode, typeof en> = { en, ka, ru };

export type CommunityAlertGeofence = {
  id: string;
  lat: number;
  lng: number;
  category: PlaceSubmissionCategory;
};

const ALERT_CATEGORY_KEYS: Record<PlaceSubmissionCategory, keyof typeof en.newPlace> = {
  auto: 'categoryAuto', taxi: 'categoryTaxi', shop: 'categoryShop', restaurant: 'categoryRestaurant', bar: 'categoryBar',
  exchange: 'categoryExchange', street: 'categoryStreet', school: 'categorySchool', atm: 'categoryAtm',
  pharmacy: 'categoryPharmacy', other: 'categoryOther',
};

function isSupportedLanguage(value: string | null): value is LanguageCode {
  return value === 'en' || value === 'ka' || value === 'ru';
}

async function getCurrentLanguage(): Promise<LanguageCode> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : 'en';
  } catch {
    return 'en';
  }
}

function landmarkName(landmark: Landmark, language: LanguageCode): string {
  return landmark[`name_${language}`] || landmark.name_en;
}

async function getCommunityAlerts(): Promise<CommunityAlertGeofence[]> {
  try {
    const raw = await AsyncStorage.getItem(COMMUNITY_ALERTS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CommunityAlertGeofence => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return typeof value.id === 'string'
        && typeof value.lat === 'number'
        && typeof value.lng === 'number'
        && typeof value.category === 'string';
    });
  } catch {
    return [];
  }
}

/**
 * Saves only the small, public pieces needed by a headless geofence task.
 * Expired/resolved alerts disappear from this cache the next time the map
 * refreshes, so they can no longer notify a visitor.
 */
export async function syncCommunityAlertGeofences(alerts: CommunityAlertGeofence[]): Promise<void> {
  const clean = alerts.filter((alert) => Number.isFinite(alert.lat) && Number.isFinite(alert.lng));
  try {
    await AsyncStorage.setItem(COMMUNITY_ALERTS_STORAGE_KEY, JSON.stringify(clean));
    const activeIds = new Set(clean.map((alert) => alert.id));
    const notifiedRaw = await AsyncStorage.getItem(COMMUNITY_ALERTS_NOTIFIED_KEY);
    const notified: unknown = notifiedRaw ? JSON.parse(notifiedRaw) : [];
    const retained = Array.isArray(notified)
      ? notified.filter((id): id is string => typeof id === 'string' && activeIds.has(id))
      : [];
    await AsyncStorage.setItem(COMMUNITY_ALERTS_NOTIFIED_KEY, JSON.stringify(retained));
  } catch {
    // Cached geofencing is a safety bonus; map markers still work if storage fails.
  }
}

async function notifyForCommunityAlert(alert: CommunityAlertGeofence): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(COMMUNITY_ALERTS_NOTIFIED_KEY);
    const previous: unknown = raw ? JSON.parse(raw) : [];
    const notified = new Set(Array.isArray(previous) ? previous.filter((id): id is string => typeof id === 'string') : []);
    if (notified.has(alert.id)) return;
    notified.add(alert.id);
    await AsyncStorage.setItem(COMMUNITY_ALERTS_NOTIFIED_KEY, JSON.stringify([...notified]));
  } catch {
    // Continue with the notification: failing to persist a de-duplication bit
    // should not suppress a nearby safety warning.
  }

  const language = await getCurrentLanguage();
  const dict = DICTIONARIES[language];
  const category = dict.newPlace[ALERT_CATEGORY_KEYS[alert.category]] ?? alert.category;
  const title = dict.alerts?.proximityTitle ?? 'Safety alert nearby';
  const body = (dict.alerts?.proximityBody ?? 'Avoid this {category} for now. An admin-verified warning is nearby.')
    .replace('{category}', category);
  await presentLocalNotification(title, body);
}

// Registered once at module load — this file is imported at the app entry
// point (index.ts) specifically so the task definition runs even on a
// headless background relaunch, before any React component mounts.
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;

  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };
  if (eventType !== Location.GeofencingEventType.Enter) return;

  const identifier = region.identifier;
  if (!identifier) return;

  if (identifier.startsWith(COMMUNITY_ALERT_PREFIX)) {
    const alertId = identifier.slice(COMMUNITY_ALERT_PREFIX.length);
    const alert = (await getCommunityAlerts()).find((item) => item.id === alertId);
    if (alert) await notifyForCommunityAlert(alert);
    return;
  }

  const landmark = landmarks.find((l) => l.id === identifier);
  if (!landmark) return;

  const justVisited = await addVisitedLandmarkId(landmark.id);
  if (!justVisited) return; // already visited earlier — don't notify twice

  // Lets an open MapScreen animate the marker immediately instead of
  // waiting for the next reload to pick up the AsyncStorage change.
  DeviceEventEmitter.emit('landmarkVisited', landmark.id);

  const language = await getCurrentLanguage();
  const dict = DICTIONARIES[language];
  const title = dict.landmarks?.arrivedTitle ?? 'You are here';
  const bodyTemplate = dict.landmarks?.arrivedBody ?? '{name}';
  const name = landmarkName(landmark, language);
  await presentLocalNotification(title, bodyTemplate.replace('{name}', name));

  // Same treatment as the evening zone nudge: a banner on the home/lock
  // screen plus a Live Activity so the arrival is visible on the Dynamic
  // Island. Best-effort — ActivityKit can refuse from a background launch.
  try {
    startLandmarkArrivalLiveActivity(title, name);
  } catch {
    // Live Activity unavailable — the notification above already landed.
  }
});

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

/**
 * Re-registers public safety alerts first, then fills any remaining iOS
 * geofence slots with nearby unvisited landmarks. iOS permits only 20 active
 * regions per app, so a verified red warning always takes precedence over a
 * sightseeing arrival nudge.
 */
export async function refreshLandmarkGeofences(
  currentLat: number,
  currentLng: number,
): Promise<void> {
  try {
    const alerts = (await getCommunityAlerts())
      .map((alert) => ({ alert, d: distanceMeters(currentLat, currentLng, alert.lat, alert.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_MONITORED_REGIONS)
      .map(({ alert }) => ({
        identifier: `${COMMUNITY_ALERT_PREFIX}${alert.id}`,
        latitude: alert.lat,
        longitude: alert.lng,
        radius: GEOFENCE_RADIUS_METERS,
        notifyOnEnter: true,
        notifyOnExit: false,
      }));

    const visited = new Set(await getVisitedLandmarkIds());
    const nearest = landmarks
      .filter((l) => !visited.has(l.id))
      .map((l) => ({ l, d: distanceMeters(currentLat, currentLng, l.lat, l.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.max(0, MAX_MONITORED_REGIONS - alerts.length))
      .map(({ l }) => ({
        identifier: l.id,
        latitude: l.lat,
        longitude: l.lng,
        radius: GEOFENCE_RADIUS_METERS,
        notifyOnEnter: true,
        notifyOnExit: false,
      }));

    const regions = [...alerts, ...nearest];
    if (regions.length === 0) {
      await stopLandmarkGeofencing();
      return;
    }
    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
  } catch {
    // Geofencing unavailable (permission revoked, simulator, etc.) — the
    // rest of the app keeps working without arrival notifications.
  }
}

export async function stopLandmarkGeofencing(): Promise<void> {
  try {
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  } catch {
    // Nothing to stop / already stopped.
  }
}

/**
 * Requests "Always" location permission and starts geofencing around the
 * tourist's current position. Returns false (no-op, not an error) if the
 * user declines — the app never blocks on this, it's a bonus feature.
 * Foreground ("When In Use") permission must already be granted first
 * (enforced by iOS itself) — Map.tsx only calls this after that succeeds.
 */
export async function initLandmarkGeofencing(): Promise<boolean> {
  try {
    // Local proximity alerts require the OS notification permission as well
    // as location permission. A refusal leaves the map and report feed fully
    // usable; only the background warning is skipped by the operating system.
    await registerForNotificationsAsync();
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return false;
    const position = await Location.getCurrentPositionAsync({});
    await refreshLandmarkGeofences(position.coords.latitude, position.coords.longitude);
    return true;
  } catch {
    return false;
  }
}
