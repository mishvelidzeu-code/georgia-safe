import * as Location from 'expo-location';

/**
 * Street address for a pin, as the OS geocoder reads it — "Rustaveli Ave 12".
 * Null when nothing sensible comes back; the listing then shows only the pin.
 */
export async function reverseGeocodeListing(coordinate: { latitude: number; longitude: number }): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync(coordinate);
    if (!place) return null;
    const street = [place.street, place.streetNumber].filter(Boolean).join(' ').trim();
    const line = street || place.name || place.district || '';
    return line.trim() || null;
  } catch {
    return null;
  }
}
