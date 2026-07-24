import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export type PlaceReviewType = 'landmark' | 'place';

export type PlaceReviewInput = {
  placeId: string;
  placeType: PlaceReviewType;
  placeName: string;
  rating: number; // 1-5
  comment?: string;
  photoBase64?: string; // from expo-image-picker { base64: true }
  photoMimeType?: string; // e.g. 'image/jpeg'
};

const BUCKET = 'place-review-photos';

async function uploadPhoto(input: PlaceReviewInput): Promise<string | null> {
  if (!supabase || !input.photoBase64) return null;
  const mime = input.photoMimeType ?? 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const path = `${input.placeType}/${input.placeId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(input.photoBase64), { contentType: mime, upsert: false });
  return error ? null : path;
}

/**
 * Anonymous, admin-only place review (stars + optional note + optional photo).
 * No name, device id, or user id is ever sent — see
 * supabase/migrations/20260724160000_create_place_reviews.sql. The app never
 * reads reviews back or shows them to other users (no Local/Community features
 * — CLAUDE.md rule 3); only an admin reviews them via the Supabase dashboard.
 * Reviews are about places/objects only, never people (rule 4).
 *
 * Resolves to `false` instead of throwing when offline, misconfigured, or the
 * rating is invalid — leaving a review is a nice-to-have, never something that
 * should surface an error to a tourist. If a photo was chosen but its upload
 * fails, the text review is still saved (a flaky photo shouldn't lose the note).
 */
export async function submitPlaceReview(input: PlaceReviewInput): Promise<boolean> {
  if (!supabase) return false;
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return false;

  const photoPath = await uploadPhoto(input);
  const comment = input.comment?.trim();
  const { error } = await supabase.from('place_reviews').insert({
    place_id: input.placeId,
    place_type: input.placeType,
    place_name: input.placeName,
    rating: input.rating,
    comment: comment ? comment : null,
    photo_path: photoPath,
  });
  return !error;
}
