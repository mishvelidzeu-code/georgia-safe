import { Platform } from 'react-native';
import * as LiveActivity from 'expo-live-activity';

// Generic, replaceable test Live Activity. Later this becomes the real
// safety-session / SOS tracker; for now it just proves the ActivityKit
// pipeline works on a physical device (lock screen + Dynamic Island).
// NOTE: expo-live-activity is deprecated upstream — when we build the
// production Live Activity, migrate to the official `expo-widgets` SDK.

let currentActivityId: string | null = null;

export function isLiveActivitySupported(): boolean {
  return Platform.OS === 'ios';
}

export function hasActiveLiveActivity(): boolean {
  return currentActivityId !== null;
}

export function startTestLiveActivity(title: string, subtitle: string): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  // Installed expo-live-activity version (0.4.2) only supports a static
  // `progress` (0-1) or a countdown `date` in progressBar — no elapsedTimer.
  // We use a 5-minute test countdown so the Dynamic Island's compact/minimal
  // views (which only render when `timerEndDateInMilliseconds` is set) show
  // something, matching how Duolingo's streak timer behaves.
  //
  // IMPORTANT: `dynamicIslandImageName` is required for the compact Dynamic
  // Island pill icon — without it, compactLeading renders nothing and the
  // Dynamic Island appears empty even though the Lock Screen view (which
  // doesn't need it) still works. See assets/liveActivity/sos_icon.png,
  // bundled into the widget's asset catalog by the plugin at prebuild time.
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

/**
 * Evening safety-zone nudge shown on the Dynamic Island (+ lock screen) when
 * the map's zones auto-activate after 19:00. A short countdown is required so
 * the compact Dynamic Island view renders (see the note in
 * startTestLiveActivity); it simply fills over ~10 minutes and the traveller
 * can swipe it away. Returns false if a Live Activity is already running or
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

export function stopTestLiveActivity(title: string, subtitle: string): void {
  if (Platform.OS !== 'ios' || !currentActivityId) {
    return;
  }

  const finalState: LiveActivity.LiveActivityState = {
    title,
    subtitle,
    progressBar: { progress: 1 },
    imageName: 'sos_icon',
    dynamicIslandImageName: 'sos_icon',
  };

  LiveActivity.stopActivity(currentActivityId, finalState);
  currentActivityId = null;
}
