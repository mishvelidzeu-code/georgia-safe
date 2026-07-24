import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { getPushToken } from './pushToken';

// What kind of place this is — a factual label (not an opinion), so it's
// never gated behind admin approval like rating/comment are. Drives the
// marker icon on the map (see MapScreen's SUBMISSION_CATEGORY_ICONS).
export type PlaceSubmissionCategory =
  | 'shop'
  | 'restaurant'
  | 'bar'
  | 'school'
  | 'atm'
  | 'pharmacy'
  | 'other';

export const PLACE_SUBMISSION_CATEGORIES: PlaceSubmissionCategory[] = [
  'shop',
  'restaurant',
  'bar',
  'school',
  'atm',
  'pharmacy',
  'other',
];

export type PlaceSubmission = {
  id: string;
  lat: number;
  lng: number;
  photoUrl: string;
  category: PlaceSubmissionCategory;
  approved: boolean;
  rating: number | null; // null until an admin approves
  comment: string | null; // null until an admin approves
};

export type PlaceSubmissionInput = {
  lat: number;
  lng: number;
  category: PlaceSubmissionCategory;
  rating: number; // 1-5
  comment?: string;
  photoBase64: string; // required — the pin needs a photo to be worth showing
  photoMimeType?: string;
};

const BUCKET = 'submitted-place-photos';

function isCategory(value: unknown): value is PlaceSubmissionCategory {
  return typeof value === 'string' && (PLACE_SUBMISSION_CATEGORIES as string[]).includes(value);
}

/**
 * A tourist-marked place: pin + photo + category go live on everyone's map
 * immediately (see supabase/migrations/20260724170000_create_place_submissions.sql
 * for the explicit rationale — this is a deliberate, user-requested exception
 * to CLAUDE.md rule 3). The rating/comment stay hidden (null) until an admin
 * approves the submission; the `place_submissions_public` view enforces that
 * masking server-side, so there's nothing for the client to hide on its own.
 *
 * Resolves to `false` instead of throwing on any failure — offline, missing
 * config, or a failed photo upload (a photo is required here, unlike
 * placeReviews.ts, since an unmoderated pin with no photo isn't useful).
 */
export async function submitPlaceSubmission(input: PlaceSubmissionInput): Promise<boolean> {
  if (!supabase) return false;
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return false;
  if (!isCategory(input.category)) return false;
  if (!input.photoBase64) return false;

  const mime = input.photoMimeType ?? 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(input.photoBase64), { contentType: mime, upsert: false });
  if (uploadError) return false;

  const pushToken = await getPushToken();
  const comment = input.comment?.trim();

  const { error } = await supabase.from('place_submissions').insert({
    lat: input.lat,
    lng: input.lng,
    photo_path: path,
    category: input.category,
    rating: input.rating,
    comment: comment ? comment : null,
    push_token: pushToken,
  });
  return !error;
}

/**
 * Reads the public, pre-masked view — approved rows carry their real rating/
 * comment, unapproved rows carry null for both (server-enforced, see the
 * migration's `place_submissions_public` view). `category` is always present
 * (never gated). Throws on failure so useRemoteData's stale-while-revalidate
 * wrapper keeps the previous list instead of clearing it on a transient
 * network blip.
 */
export async function fetchPlaceSubmissions(): Promise<PlaceSubmission[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('place_submissions_public').select('*');
  if (error) throw error;
  if (!data) throw new Error('No place submissions returned');

  return data.map((row) => ({
    id: String(row.id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    photoUrl: supabase!.storage.from(BUCKET).getPublicUrl(String(row.photo_path)).data.publicUrl,
    category: isCategory(row.category) ? row.category : 'other',
    approved: Boolean(row.approved),
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    comment: row.comment === null || row.comment === undefined ? null : String(row.comment),
  }));
}
