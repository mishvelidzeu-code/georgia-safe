import * as Location from 'expo-location';
import * as SMS from 'expo-sms';

export type SendLocationSmsResult = 'sent' | 'unavailable' | 'failed';

/**
 * Best-effort: tries to attach a Google Maps link for the current location
 * to `bodyWithLocationPrefix`, falling back to `bodyNoLocation` if location
 * permission is denied or a fix can't be obtained, then sends the result via
 * the device's SMS composer. Shared by SosButton (manual SOS) and
 * CheckInTimer (automatic "missed check-in" alert) so both use identical
 * location + SMS logic instead of duplicating it.
 */
export async function sendLocationSms(
  phone: string,
  bodyWithLocationPrefix: string,
  bodyNoLocation: string,
): Promise<SendLocationSmsResult> {
  let body = bodyNoLocation;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const position = await Location.getCurrentPositionAsync({});
      const mapsUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
      body = `${bodyWithLocationPrefix} ${mapsUrl}`;
    }
  } catch {
    // Keep the no-location fallback body if location fails or is denied.
  }

  const isAvailable = await SMS.isAvailableAsync();
  if (!isAvailable) return 'unavailable';

  try {
    await SMS.sendSMSAsync([phone], body);
    return 'sent';
  } catch {
    return 'failed';
  }
}
