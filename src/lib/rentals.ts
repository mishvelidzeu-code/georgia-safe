import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { isSameCity } from './cities';

// Partners and their listings (cars, bars, exchanges, transfers, hotels, tours).
//
// Two approval gates, both enforced by RLS (see
// supabase/migrations/20260912120000_partner_marketplace.sql):
//   partners.approved        — is this a real company? (admin decides)
//   partner_listings.status  — 'published' only after an admin approves; an
//                              edit to a published row waits in pending_changes
// Tourists read `partner_listings_public`, which only contains rows that pass both.

const BUCKET = 'partner-cars';

/** Photos per listing. The first one is the cover shown on Getting Around. */
export const MAX_LISTING_PHOTOS = 5;

export type Partner = {
  id: string;
  companyName: string;
  city: string;
  phone: string;
  whatsapp: string | null;
  approved: boolean;
  active: boolean;
  username: string | null;
  requiresPasswordChange: boolean;
};

export const LISTING_CATEGORIES = [
  'car_rental', 'bar_restaurant', 'currency_exchange',
  'airport_transfer', 'hotel', 'tour', 'other',
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];
export type ListingStatus = 'pending' | 'published' | 'hidden' | 'rejected';
export type PartnerListing = {
  id: string; partnerId: string; category: ListingCategory; title: string; city: string;
  address: string | null; phone: string | null; whatsapp: string | null;
  workingHours: string | null; priceDescription: string | null; description: string | null;
  latitude: number | null; longitude: number | null; details: Record<string, unknown>;
  photoPaths: string[]; photoUrls: string[]; status: ListingStatus; rejectionReason: string | null;
  reviewStatus: 'pending' | null;
  companyName?: string;
};

/** The three shapes a tourist can filter by. Stored in listing details.body_type. */
export const BODY_TYPES = ['coupe', 'sedan', 'suv'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

function bodyTypeOf(value: unknown): BodyType | null {
  return BODY_TYPES.includes(value as BodyType) ? (value as BodyType) : null;
}

export type PartnerCar = {
  id: string;
  make: string;
  model: string;
  year: number | null;
  bodyType: BodyType | null;
  transmission: 'manual' | 'automatic' | null;
  seats: number | null;
  pricePerDay: number | null;
  city: string;
  description: string | null;
  photoUrls: string[];
  approved: boolean;
};

/** A listing as a tourist sees it — always approved, always with contacts. */
export type RentalCar = Omit<PartnerCar, 'approved'> & {
  companyName: string;
  phone: string;
  whatsapp: string;
};

function photoUrls(paths: unknown): string[] {
  if (!Array.isArray(paths) || !supabase) return [];
  return paths
    .filter((p): p is string => typeof p === 'string')
    .map((p) => supabase!.storage.from(BUCKET).getPublicUrl(p).data.publicUrl);
}

// ---------------------------------------------------------------------------
// Tourist side
// ---------------------------------------------------------------------------

/**
 * Approved cars, optionally narrowed to one city.
 *
 * City matching is a case-insensitive prefix rather than equality: the city
 * comes from the OS reverse geocoder on the tourist's side and from free text
 * typed by a partner on the other — and in whatever language each side used
 * ("Tbilisi" vs "თბილისი"). The match is therefore done client-side through
 * cities.ts rather than with a database prefix filter; the car_rental list is
 * small. Passing no city returns everything, which is the right fallback when
 * location is unavailable — better a longer list than an empty screen.
 */
export async function fetchRentalCars(city?: string): Promise<RentalCar[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('partner_listings_public').select('*').eq('category', 'car_rental');
  if (error) throw error;

  const wanted = city?.trim();
  const rows = (data ?? []).filter((row) => !wanted || isSameCity(String(row.city), wanted));

  return rows.map((row) => ({
    id: String(row.id),
    make: String(row.details?.make ?? row.title),
    model: String(row.details?.model ?? ''),
    year: row.details?.year == null ? null : Number(row.details.year),
    bodyType: bodyTypeOf(row.details?.body_type),
    transmission: (row.details?.transmission as RentalCar['transmission']) ?? null,
    seats: row.details?.seats == null ? null : Number(row.details.seats),
    pricePerDay:
      row.details?.daily_price === null || row.details?.daily_price === undefined
        ? null
        : Number(row.details.daily_price),
    city: String(row.city),
    description: row.description ? String(row.description) : null,
    photoUrls: photoUrls(row.photo_paths),
    companyName: String(row.company_name),
    phone: String(row.phone ?? ''),
    whatsapp: String(row.whatsapp ?? row.phone ?? ''),
  }));
}

// ---------------------------------------------------------------------------
// Partner side
// ---------------------------------------------------------------------------

/** The signed-in user's partner account, or null if they aren't one. */
export async function fetchMyPartner(): Promise<Partner | null> {
  if (!supabase) return null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('partners')
      .select('id, company_name, city, phone, whatsapp, approved, active, username, requires_password_change')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;

    return {
      id: String(data.id),
      companyName: String(data.company_name),
      city: String(data.city),
      phone: String(data.phone),
      whatsapp: data.whatsapp ? String(data.whatsapp) : null,
      approved: Boolean(data.approved),
      active: Boolean(data.active),
      username: data.username ? String(data.username) : null,
      requiresPasswordChange: Boolean(data.requires_password_change),
    };
  } catch {
    return null;
  }
}

function mapListing(row: Record<string, any>): PartnerListing {
  return {
    id: String(row.id), partnerId: String(row.partner_id), category: row.category as ListingCategory,
    title: String(row.title), city: String(row.city), address: row.address ? String(row.address) : null,
    phone: row.phone ? String(row.phone) : null, whatsapp: row.whatsapp ? String(row.whatsapp) : null,
    workingHours: row.working_hours ? String(row.working_hours) : null,
    priceDescription: row.price_description ? String(row.price_description) : null,
    description: row.description ? String(row.description) : null,
    latitude: row.latitude == null ? null : Number(row.latitude), longitude: row.longitude == null ? null : Number(row.longitude),
    details: row.details && typeof row.details === 'object' ? row.details : {},
    photoPaths: Array.isArray(row.photo_paths) ? (row.photo_paths as unknown[]).filter((p): p is string => typeof p === 'string') : [],
    photoUrls: photoUrls(row.photo_paths),
    status: row.status as ListingStatus, rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
    reviewStatus: row.review_status === 'pending' ? 'pending' : null,
    companyName: row.company_name ? String(row.company_name) : undefined,
  };
}

export async function fetchPartnerListings(partnerId: string): Promise<PartnerListing[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('partner_listings').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapListing);
}

export type ListingInput = Omit<PartnerListing, 'id'|'partnerId'|'photoPaths'|'photoUrls'|'status'|'rejectionReason'|'reviewStatus'|'companyName'> & { photosBase64: string[] };

/** Uploads up to MAX_LISTING_PHOTOS photos under the partner's folder; a failed file is skipped, not fatal. */
export async function uploadListingPhotos(partnerId: string, photosBase64: string[]): Promise<string[]> {
  if (!supabase) return [];
  const paths: string[] = [];
  for (const base64 of photosBase64.slice(0, MAX_LISTING_PHOTOS)) {
    const path = `${partnerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, decode(base64), { contentType: 'image/jpeg', upsert: false });
    if (!error) paths.push(path);
  }
  return paths;
}

export async function createPartnerListing(partnerId: string, input: ListingInput): Promise<boolean> {
  if (!supabase) return false;
  const paths = await uploadListingPhotos(partnerId, input.photosBase64);
  const { error } = await supabase.from('partner_listings').insert({
    partner_id: partnerId, category: input.category, title: input.title.trim(), city: input.city.trim(),
    address: input.address?.trim() || null, phone: input.phone?.trim() || null, whatsapp: input.whatsapp?.trim() || null,
    working_hours: input.workingHours?.trim() || null, price_description: input.priceDescription?.trim() || null,
    description: input.description?.trim() || null, latitude: input.latitude, longitude: input.longitude,
    details: input.details, photo_paths: paths, status: 'pending',
  });
  return !error;
}

export async function deletePartnerListing(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('partner_listings').delete().eq('id', id);
  return !error;
}

export async function updatePartnerListing(id: string, input: Omit<ListingInput, 'photosBase64'|'category'>): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('partner_submit_listing_update', {
    listing_id: id,
    changes: {
      title: input.title.trim(), city: input.city.trim(), address: input.address?.trim() || null,
      phone: input.phone?.trim() || null, whatsapp: input.whatsapp?.trim() || null,
      working_hours: input.workingHours?.trim() || null, price_description: input.priceDescription?.trim() || null,
      description: input.description?.trim() || null, latitude: input.latitude, longitude: input.longitude,
      details: input.details,
    },
  });
  return !error;
}

export async function fetchPublishedPartnerListings(): Promise<PartnerListing[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('partner_listings_public').select('*').not('latitude', 'is', null).not('longitude', 'is', null);
  if (error) throw error;
  return (data ?? []).map(mapListing);
}

export async function changePartnerPassword(password: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return false;
  const { error: flagError } = await supabase.rpc('complete_partner_password_change');
  return !flagError;
}
