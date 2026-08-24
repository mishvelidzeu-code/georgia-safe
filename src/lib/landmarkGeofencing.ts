import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import landmarksData from '../data/landmarks.json';
import type { LanguageCode } from '../i18n/LanguageContext';
import en from '../i18n/en.json';
import ka from '../i18n/ka.json';
import ru from '../i18n/ru.json';
import { presentLocalNotification } from './notifications';
import { startLandmarkArrivalLiveActivity } from './liveActivity';
import { addVisitedLandmarkId, getVisitedLandmarkIds } from './storage';

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

  const landmark = landmarks.find((l) => l.id === region.identifier);
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
 * Re-registers the nearest MAX_MONITORED_REGIONS unvisited landmarks around
 * the given position. Call on Map mount and periodically as the tourist
 * moves between regions. Never throws — geofencing is a nice-to-have on top
 * of the app's core safety features, never allowed to block them.
 */
export async function refreshLandmarkGeofences(
  currentLat: number,
  currentLng: number,
): Promise<void> {
  try {
    const visited = new Set(await getVisitedLandmarkIds());
    const nearest = landmarks
      .filter((l) => !visited.has(l.id))
      .map((l) => ({ l, d: distanceMeters(currentLat, currentLng, l.lat, l.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_MONITORED_REGIONS)
      .map(({ l }) => ({
        identifier: l.id,
        latitude: l.lat,
        longitude: l.lng,
        radius: GEOFENCE_RADIUS_METERS,
        notifyOnEnter: true,
        notifyOnExit: false,
      }));

    if (nearest.length === 0) {
      await stopLandmarkGeofencing();
      return;
    }
    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, nearest);
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
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return false;
    const position = await Location.getCurrentPositionAsync({});
    await refreshLandmarkGeofences(position.coords.latitude, position.coords.longitude);
    return true;
  } catch {
    return false;
  }
}
