import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForNotificationsAsync(): Promise<boolean> {
  // Android 13 shows its notification permission dialog only after a channel
  // exists. Create it first so the safety-warning permission can be granted
  // reliably on both new and existing installs.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

/**
 * Immediately presents a local notification (home/lock screen banner).
 * Never throws — if the user denied notifications it just no-ops.
 */
export async function presentLocalNotification(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {
    // Permissions denied or notifications unavailable — non-critical.
  }
}

const EVENING_NOTIFICATION_ID = 'evening-zones';
const EVENING_HOUR = 19; // matches isEveningOrLater() in guardianContext.ts

/**
 * Schedules the evening safety-zone nudge as a daily 19:00 notification, so
 * iOS/Android deliver it even while the app is closed — code in the app only
 * runs while it is open. Replaces any earlier schedule (same identifier), so
 * calling it again after a language change swaps in the new text. Never asks
 * for permission itself and never throws.
 */
export async function scheduleEveningZoneNotification(title: string, body: string): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.cancelScheduledNotificationAsync(EVENING_NOTIFICATION_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: EVENING_NOTIFICATION_ID,
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: EVENING_HOUR,
        minute: 0,
      },
    });
  } catch {
    // Notifications unavailable — non-critical.
  }
}
