import { supabase } from './supabase';
import type { SafePlace, SafePlaceType, Zone } from './remoteData';
import type { PlaceSubmissionCategory } from './placeSubmissions';

// Admin panel data layer. Every function here talks to a table that is
// normally write-only or read-only for tourists — access is granted purely by
// the RLS policies in supabase/migrations/20260726100000_admin_access.sql,
// which check the signed-in user's email server-side.
//
// The ADMIN_EMAIL constant below only decides whether to SHOW the panel. It is
// not a security boundary: anyone can patch a client. If a non-admin somehow
// reached these calls, Postgres would reject them.

export const ADMIN_EMAIL = 'mishvelidze.u@gmail.com';

const SUBMISSION_BUCKET = 'submitted-place-photos';
const REVIEW_BUCKET = 'place-review-photos';

/** Whether the signed-in email is the administrator's. Display gate only. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === ADMIN_EMAIL;
}

/** Email of the currently signed-in user, or null when signed out/offline. */
export async function getCurrentEmail(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

/** A submission as the admin sees it — rating/comment are never masked here. */
export type AdminSubmission = {
  id: string;
  lat: number;
  lng: number;
  photoUrl: string;
  category: PlaceSubmissionCategory;
  approved: boolean;
  rating: number;
  comment: string | null;
  createdAt: string;
};

/**
 * Reads the BASE place_submissions table (not the masked public view), so
 * pending rows show their rating and comment before a decision is made.
 * Newest first — the queue is worked from the top.
 */
export async function fetchAdminSubmissions(): Promise<AdminSubmission[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('place_submissions')
    .select('id, lat, lng, photo_path, category, approved, rating, comment, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    photoUrl: supabase!.storage.from(SUBMISSION_BUCKET).getPublicUrl(String(row.photo_path)).data
      .publicUrl,
    category: String(row.category) as PlaceSubmissionCategory,
    approved: Boolean(row.approved),
    rating: Number(row.rating),
    comment: row.comment === null || row.comment === undefined ? null : String(row.comment),
    createdAt: String(row.created_at),
  }));
}

/**
 * Approves or un-approves a submission. Approving reveals its rating and
 * comment to every tourist through the public view, and lets the existing
 * notify-place-approval function push a notification to the submitter.
 */
export async function setSubmissionApproved(id: string, approved: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('place_submissions').update({ approved }).eq('id', id);
  return !error;
}

/** Removes a submission outright — used to reject spam or a bad photo. */
export async function deleteSubmission(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('place_submissions').delete().eq('id', id);
  return !error;
}

// ---------------------------------------------------------------------------
// Safe places
// ---------------------------------------------------------------------------

export type SafePlaceInput = {
  id: string;
  name: string;
  type: SafePlaceType;
  address: string;
  lat: number;
  lng: number;
  open_24h: boolean;
};

/**
 * Creates or replaces a safe place. Upsert rather than insert so editing an
 * existing row and adding a new one are the same call — the id is the primary
 * key and is chosen by the admin (e.g. `pharmacy_psp_batumi`).
 */
export async function upsertSafePlace(input: SafePlaceInput): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('safe_places').upsert({
    id: input.id.trim(),
    name: input.name.trim(),
    type: input.type,
    address: input.address.trim(),
    lat: input.lat,
    lng: input.lng,
    open_24h: input.open_24h,
  });
  return !error;
}

export async function deleteSafePlace(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('safe_places').delete().eq('id', id);
  return !error;
}

/** All safe places, newest data straight from the server (no local fallback). */
export async function fetchAdminSafePlaces(): Promise<SafePlace[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('safe_places').select('*').order('id');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    type: String(row.type) as SafePlaceType,
    address: row.address === null || row.address === undefined ? '' : String(row.address),
    lat: Number(row.lat),
    lng: Number(row.lng),
    open_24h: Boolean(row.open_24h),
  }));
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export type ZoneScoreInput = {
  id: string;
  day_score: number;
  night_score: number;
  tips_en: string[];
  tips_ka: string[];
  tips_ru: string[];
};

/**
 * Updates the editable parts of a zone. day_level/night_level are derived from
 * the scores here rather than being entered separately, so the colour on the
 * map can never contradict the number next to it.
 */
export async function updateZone(input: ZoneScoreInput): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('zones')
    .update({
      day_score: input.day_score,
      night_score: input.night_score,
      day_level: scoreToLevel(input.day_score),
      night_level: scoreToLevel(input.night_score),
      tips_en: input.tips_en,
      tips_ka: input.tips_ka,
      tips_ru: input.tips_ru,
    })
    .eq('id', input.id);
  return !error;
}

/** Mirrors the zones table's own three-value level check constraint. */
function scoreToLevel(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 50) return 'green';
  if (score >= 20) return 'yellow';
  return 'red';
}

export async function fetchAdminZones(): Promise<Zone[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('zones').select('*').order('id');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name_en: String(row.name_en),
    name_ka: row.name_ka ? String(row.name_ka) : '',
    name_ru: row.name_ru ? String(row.name_ru) : '',
    day_score: Number(row.day_score),
    night_score: Number(row.night_score),
    day_level: row.day_level as Zone['day_level'],
    night_level: row.night_level as Zone['night_level'],
    lat: Number(row.lat),
    lng: Number(row.lng),
    tips_en: Array.isArray(row.tips_en) ? (row.tips_en as string[]) : [],
    tips_ka: Array.isArray(row.tips_ka) ? (row.tips_ka as string[]) : [],
    tips_ru: Array.isArray(row.tips_ru) ? (row.tips_ru as string[]) : [],
  }));
}

// ---------------------------------------------------------------------------
// Reviews and zone feedback (read-only)
// ---------------------------------------------------------------------------

export type AdminReview = {
  id: string;
  placeName: string;
  placeType: 'landmark' | 'place';
  rating: number;
  comment: string | null;
  photoUrl: string | null;
  createdAt: string;
};

/**
 * Review photos live in a private bucket, so each one needs a short-lived
 * signed URL rather than a public one. An expired or failed signature just
 * means no thumbnail — never a failed load for the whole list.
 */
export async function fetchAdminReviews(): Promise<AdminReview[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('place_reviews')
    .select('id, place_name, place_type, rating, comment, photo_path, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = data ?? [];
  const signed = await Promise.all(
    rows.map(async (row) => {
      if (!row.photo_path) return null;
      const { data: url } = await supabase!.storage
        .from(REVIEW_BUCKET)
        .createSignedUrl(String(row.photo_path), 60 * 60);
      return url?.signedUrl ?? null;
    }),
  );

  return rows.map((row, i) => ({
    id: String(row.id),
    placeName: String(row.place_name),
    placeType: row.place_type === 'landmark' ? 'landmark' : 'place',
    rating: Number(row.rating),
    comment: row.comment === null || row.comment === undefined ? null : String(row.comment),
    photoUrl: signed[i],
    createdAt: String(row.created_at),
  }));
}

/** Aggregated safe/unsafe vote counts per zone, highest traffic first. */
// ---------------------------------------------------------------------------
// Rental partners
// ---------------------------------------------------------------------------

export type AdminPartner = {
  id: string;
  companyName: string;
  city: string;
  phone: string;
  approved: boolean;
};

export type AdminPendingCar = {
  id: string;
  partnerId: string;
  make: string;
  model: string;
  city: string;
  pricePerDay: number | null;
  description: string | null;
  photoUrls: string[];
  approved: boolean;
};

/** Every partner account, unapproved first — the queue is worked from the top. */
export async function fetchAdminPartners(): Promise<AdminPartner[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('partners')
    .select('id, company_name, city, phone, approved')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      id: String(row.id),
      companyName: String(row.company_name),
      city: String(row.city),
      phone: String(row.phone),
      approved: Boolean(row.approved),
    }))
    .sort((a, b) => Number(a.approved) - Number(b.approved));
}

export async function setPartnerApproved(id: string, approved: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('partners').update({ approved }).eq('id', id);
  return !error;
}

/** All listings across all partners, unapproved first. */
export async function fetchAdminCars(): Promise<AdminPendingCar[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('partner_cars')
    .select('id, partner_id, make, model, city, price_per_day, description, photo_paths, approved')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      id: String(row.id),
      partnerId: String(row.partner_id),
      make: String(row.make),
      model: String(row.model),
      city: String(row.city),
      pricePerDay:
        row.price_per_day === null || row.price_per_day === undefined
          ? null
          : Number(row.price_per_day),
      description: row.description ? String(row.description) : null,
      photoUrls: Array.isArray(row.photo_paths)
        ? (row.photo_paths as string[]).map(
            (p) => supabase!.storage.from('partner-cars').getPublicUrl(p).data.publicUrl,
          )
        : [],
      approved: Boolean(row.approved),
    }))
    .sort((a, b) => Number(a.approved) - Number(b.approved));
}

export async function setCarApproved(id: string, approved: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('partner_cars').update({ approved }).eq('id', id);
  return !error;
}

export async function deleteAdminCar(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('partner_cars').delete().eq('id', id);
  return !error;
}

export type ZoneFeedbackTally = {
  zoneId: string;
  safe: number;
  unsafe: number;
};

export async function fetchZoneFeedback(): Promise<ZoneFeedbackTally[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('feedback').select('zone_id, vote');
  if (error) throw error;

  const tally = new Map<string, ZoneFeedbackTally>();
  for (const row of data ?? []) {
    const zoneId = String(row.zone_id);
    const entry = tally.get(zoneId) ?? { zoneId, safe: 0, unsafe: 0 };
    if (row.vote === 'safe') entry.safe += 1;
    else entry.unsafe += 1;
    tally.set(zoneId, entry);
  }
  return [...tally.values()].sort((a, b) => b.safe + b.unsafe - (a.safe + a.unsafe));
}
