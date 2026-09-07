import { Platform } from 'react-native';
import * as LiveActivity from 'expo-live-activity';

// Live Activities used for concrete map events: evening-zone reminders and
// landmark arrivals. NOTE: expo-live-activity is deprecated upstream; migrate
// these to the official `expo-widgets` SDK before expanding the feature.

let currentActivityId: string | null = null;

export function isLiveActivitySupported(): boolean {
  return Platform.OS === 'ios';
}

export function hasActiveLiveActivity(): boolean {
  return currentActivityId !== null;
}

/**
 * Evening safety-zone nudge shown on the Dynamic Island (+ lock screen) when
 * the map's zones auto-activate after 19:00. A short countdown is required so
 * the compact Dynamic Island view renders (see the note in
 * the progress timer simply fills over ~10 minutes and the traveller can
 * swipe it away. Returns false if a Live Activity is already running or
 * the platform doesn't support ActivityKit.
 */
export function startEveningZoneLiveActivity(title: string, subtitle: string): boolean {
  if (Platform.OS !== 'ios' || currentActivityId !== null) {
    return false;
  }

  const state: LiveActivity.LiveActivityState = {
    title,
    subtitle,
    progressBar: {
      date: Date.now() + 10 * 60 * 1000,
    },
    imageName: 'sos_icon',
    dynamicIslandImageName: 'sos_icon',
  };

  const config: LiveActivity.LiveActivityConfig = {
    backgroundColor: '#0f172a',
    titleColor: '#f8fafc',
    subtitleColor: '#94a3b8',
    progressViewTint: '#eab308',
    progressViewLabelColor: '#f8fafc',
    timerType: 'digital',
    imagePosition: 'right',
    padding: 16,
  };

  const id = LiveActivity.startActivity(state, config);
  if (id) {
    currentActivityId = id;
    return true;
  }
  return false;
}

/**
 * "You've arrived" nudge when a landmark geofence fires — the same shape as
 * the evening one, so the arrival shows up on the Dynamic Island (and lock
 * screen) alongside the local notification banner, instead of only as a
 * banner. Green tint: arriving somewhere is a positive event, not a warning.
 *
 * iOS only starts Live Activities from the background in limited cases, so
 * this may legitimately return false when the geofence fires with the app
 * closed — the local notification is the guaranteed part, this is the bonus.
 */
export function startLandmarkArrivalLiveActivity(title: string, subtitle: string): boolean {
  if (Platform.OS !== 'ios' || currentActivityId !== null) {
    return false;
  }

  const state: LiveActivity.LiveActivityState = {
    title,
    subtitle,
    progressBar: {
      date: Date.now() + 5 * 60 * 1000,
    },
    imageName: 'sos_icon',
    dynamicIslandImageName: 'sos_icon',
  };

  const config: LiveActivity.LiveActivityConfig = {
    backgroundColor: '#0f172a',
    titleColor: '#f8fafc',
    subtitleColor: '#94a3b8',
    progressViewTint: '#22c55e',
    progressViewLabelColor: '#f8fafc',
    timerType: 'digital',
    imagePosition: 'right',
    padding: 16,
  };

  const id = LiveActivity.startActivity(state, config);
  if (id) {
    currentActivityId = id;
    return true;
  }
  return false;
}
