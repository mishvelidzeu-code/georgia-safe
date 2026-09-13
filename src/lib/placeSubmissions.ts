import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { getPushToken } from './pushToken';

// What kind of place this is — a factual label (not an opinion), so it's
// never gated behind admin approval like rating/comment are. Drives the
// marker icon on the map (see MapScreen's SUBMISSION_CATEGORY_ICONS).
export type PlaceSubmissionCategory =
  | 'auto'
  | 'taxi'
  | 'shop'
  | 'restaurant'
  | 'bar'
  | 'exchange'
  | 'street'
  | 'school'
  | 'atm'
  | 'pharmacy'
  | 'other';

/** A green recommendation belongs on the map; a red alert also belongs in the
 * Alerts feed and has a short public lifetime. */
export type PlaceSubmissionKind = 'positive' | 'alert';

export const PLACE_SUBMISSION_CATEGORIES: PlaceSubmissionCategory[] = [
  'auto',
  'taxi',
  'shop',
  'restaurant',
  'bar',
  'exchange',
  'street',
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
  kind: PlaceSubmissionKind;
  approved: boolean;
  rating: number | null; // null until an admin approves
  comment: string | null; // null until an admin approves
  createdAt: string;
  expiresAt: string | null;
};

export type PlaceSubmissionInput = {
  lat: number;
  lng: number;
  category: PlaceSubmissionCategory;
  kind: PlaceSubmissionKind;
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
 * A tourist-submitted alert starts as private moderation work. The public view
 * returns it only after admin approval and while it is still active, so a
 * pending report cannot leak its photo, location, rating, or warning text.
 *
 * A signed-in visitor gets up to fifty free reports during the temporary
 * launch allowance. The database function atomically
 * claims that use alongside the insert; this result is deliberately distinct
 * from an ordinary network/upload failure so the UI opens the paywall only
 * after a definite quota result.
 */
export type PlaceSubmissionResult = 'submitted' | 'limit_reached' | 'failed';

export async function submitPlaceSubmission(input: PlaceSubmissionInput): Promise<PlaceSubmissionResult> {
  if (!supabase) return 'failed';
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return 'failed';
  if (!isCategory(input.category)) return 'failed';
  if (input.kind !== 'positive' && input.kind !== 'alert') return 'failed';
  if (!input.photoBase64) return 'failed';

  // Check after the visitor has completed the form, not when they long-press
  // the map. The RPC below repeats the decision atomically before inserting.
  const { data: allowed, error: allowanceError } = await supabase.rpc('can_create_place_submission');
  if (allowanceError) return 'failed';
  if (!allowed) return 'limit_reached';

  const mime = input.photoMimeType ?? 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(input.photoBase64), { contentType: mime, upsert: false });
  if (uploadError) return 'failed';

  const pushToken = await getPushToken();
  const comment = input.comment?.trim();

  const { error } = await supabase.rpc('create_place_submission', {
    p_lat: input.lat,
    p_lng: input.lng,
    p_photo_path: path,
    p_category: input.category,
    p_submission_type: input.kind,
    p_rating: input.rating,
    p_comment: comment ? comment : null,
    p_push_token: pushToken,
  });
  if (error?.message.includes('FREE_PLACE_SUBMISSION_LIMIT_REACHED')) return 'limit_reached';
  return error ? 'failed' : 'submitted';
}

/**
 * Reads only approved, unresolved alerts whose seven-day public window has
 * not ended. Filtering is enforced by the database view, never the UI.
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
    kind: row.submission_type === 'positive' ? 'positive' : 'alert',
    approved: Boolean(row.approved),
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    comment: row.comment === null || row.comment === undefined ? null : String(row.comment),
    createdAt: String(row.created_at),
    expiresAt: row.expires_at === null || row.expires_at === undefined ? null : String(row.expires_at),
  }));
}
