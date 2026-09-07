import * as Location from 'expo-location';
import * as SMS from 'expo-sms';

export type SendLocationSmsResult =
  | 'sent'
  | 'cancelled'
  | 'unknown'
  | 'unavailable'
  | 'failed';

/**
 * Best-effort: tries to attach a Google Maps link for the current location
 * to `bodyWithLocationPrefix`, falling back to `bodyNoLocation` if location
 * permission is denied or a fix can't be obtained, then sends the result via
 * the device's SMS composer. The user still reviews the prepared message and
 * explicitly taps Send. "sent" means the system composer reported that the
 * message was sent or scheduled; it does not prove delivery to the recipient.
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
    const response = await SMS.sendSMSAsync([phone], body);
    return response.result;
  } catch {
    return 'failed';
  }
}
