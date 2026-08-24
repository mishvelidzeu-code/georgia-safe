import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

// Admin-curated photos shown in the map's info sheet for landmarks and safe
// places. Reading is public; writing is admin-only, enforced by RLS (see
// supabase/migrations/20260726110000_create_place_photos.sql).

export type PlacePhotoType = 'landmark' | 'place';

export type PlacePhoto = {
  id: string;
  placeId: string;
  placeType: PlacePhotoType;
  url: string;
};

const BUCKET = 'place-photos';

/** Two is what the sheet can show side by side without needing to scroll. */
export const MAX_PHOTOS_PER_PLACE = 2;

/**
 * Every curated photo in one request, keyed by `${placeType}:${placeId}`.
 *
 * The map has ~117 pins and a sheet can open on any of them, so fetching per
 * place on tap would mean a network round trip before the sheet could show
 * anything. The whole table is a few hundred rows at most — one request on
 * mount, then every lookup is local.
 *
 * Throws on failure so useRemoteData keeps the last good map instead of
 * blanking every photo on a transient network blip.
 */
export async function fetchPlacePhotos(): Promise<Record<string, PlacePhoto[]>> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('place_photos')
    .select('id, place_id, place_type, photo_path')
    .order('created_at');
  if (error) throw error;

  const grouped: Record<string, PlacePhoto[]> = {};
  for (const row of data ?? []) {
    const placeType = row.place_type === 'landmark' ? 'landmark' : 'place';
    const placeId = String(row.place_id);
    const key = photoKey(placeType, placeId);
    const photo: PlacePhoto = {
      id: String(row.id),
      placeId,
      placeType,
      url: supabase.storage.from(BUCKET).getPublicUrl(String(row.photo_path)).data.publicUrl,
    };
    grouped[key] = grouped[key] ? [...grouped[key], photo] : [photo];
  }
  return grouped;
}

export function photoKey(placeType: PlacePhotoType, placeId: string): string {
  return `${placeType}:${placeId}`;
}

/**
 * Uploads one photo and links it to a place. Returns false on any failure
 * (offline, storage rejected, not admin) so the caller can show a retry.
 */
export async function uploadPlacePhoto(
  placeType: PlacePhotoType,
  placeId: string,
  base64: string,
  mimeType = 'image/jpeg',
): Promise<boolean> {
  if (!supabase) return false;
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${placeType}-${placeId}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), { contentType: mimeType, upsert: false });
  if (uploadError) return false;

  const { error } = await supabase.from('place_photos').insert({
    place_id: placeId,
    place_type: placeType,
    photo_path: path,
  });
  return !error;
}

/**
 * Removes the row and the underlying file. The row goes first: an orphaned
 * file in storage is invisible and harmless, whereas a row pointing at a
 * deleted file would render as a broken image for every tourist.
 */
export async function deletePlacePhoto(id: string, url: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('place_photos').delete().eq('id', id);
  if (error) return false;

  const path = url.split(`/${BUCKET}/`).pop();
  if (path) {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
  }
  return true;
}
