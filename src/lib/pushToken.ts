import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Best-effort Expo push token, used only to notify a tourist back when their
 * own submitted place (see placeSubmissions.ts) is approved by an admin —
 * never used for any other purpose, never shown to other users, and never
 * read back by the app itself. Returns null on any failure (permission
 * denied, no physical device, missing EAS projectId, etc.) — never throws,
 * since a submission must still succeed even without a working push token.
 */
export async function getPushToken(): Promise<string | null> {
  try {
    // Android 13+ needs a notification channel before requesting an Expo push
    // token. Without it, some devices return a token that never presents a
    // visible notification even though Expo accepts the send request.
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
    if (finalStatus !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data ?? null;
  } catch {
    return null;
  }
}
