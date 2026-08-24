/**
 * Is this coordinate inside Georgia?
 *
 * Everything this app knows about — zones, landmarks, pharmacies, scams,
 * rental partners — is Georgian. So "where is the tourist standing" splits
 * into two very different states, and the app has to behave differently in
 * each: they are here (centre the map on them, filter by their city), or
 * they are not here yet — planning the trip from home, or an App Store
 * reviewer opening the app in California. In that second state, centring on
 * their real position produces an empty map, which reads as a broken app.
 *
 * A bounding box is deliberate: a precise border polygon would cost far more
 * for no benefit, since being a few kilometres out on the Turkish or Armenian
 * side changes nothing about how the app should behave.
 */
export const GEORGIA_BOUNDS = {
  minLat: 41.0,
  maxLat: 43.65,
  minLng: 39.9,
  maxLng: 46.8,
} as const;

export function isInsideGeorgia(lat: number, lng: number): boolean {
  return (
    lat >= GEORGIA_BOUNDS.minLat &&
    lat <= GEORGIA_BOUNDS.maxLat &&
    lng >= GEORGIA_BOUNDS.minLng &&
    lng <= GEORGIA_BOUNDS.maxLng
  );
}
