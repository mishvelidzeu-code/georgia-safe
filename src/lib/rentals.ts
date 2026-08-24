import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

// Car rental partners and their listings.
//
// Two approval gates, both enforced by RLS (see
// supabase/migrations/20260726120000_create_rental_partners.sql):
//   partners.approved     — is this a real company? (admin decides)
//   partner_cars.approved — is this listing acceptable? (admin decides, and a
//                           trigger resets it whenever the partner edits)
// Tourists read `rental_cars_public`, which only contains rows that pass both.

const BUCKET = 'partner-cars';

export type Partner = {
  id: string;
  companyName: string;
  city: string;
  phone: string;
  whatsapp: string | null;
  approved: boolean;
};

export type PartnerCar = {
  id: string;
  make: string;
  model: string;
  year: number | null;
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
 * typed by a partner on the other, so "Tbilisi" and "Tbilisi, Georgia" have to
 * meet. Passing no city returns everything, which is the right fallback when
 * location is unavailable — better a longer list than an empty screen.
 */
export async function fetchRentalCars(city?: string): Promise<RentalCar[]> {
  if (!supabase) throw new Error('Supabase not configured');
  let query = supabase.from('rental_cars_public').select('*');
  if (city && city.trim()) query = query.ilike('city', `${city.trim()}%`);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    make: String(row.make),
    model: String(row.model),
    year: row.year === null || row.year === undefined ? null : Number(row.year),
    transmission: (row.transmission as RentalCar['transmission']) ?? null,
    seats: row.seats === null || row.seats === undefined ? null : Number(row.seats),
    pricePerDay:
      row.price_per_day === null || row.price_per_day === undefined
        ? null
        : Number(row.price_per_day),
    city: String(row.city),
    description: row.description ? String(row.description) : null,
    photoUrls: photoUrls(row.photo_paths),
    companyName: String(row.company_name),
    phone: String(row.phone),
    whatsapp: String(row.whatsapp),
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
      .select('id, company_name, city, phone, whatsapp, approved')
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
    };
  } catch {
    return null;
  }
}

/** Every car belonging to this partner, approved or not. */
export async function fetchPartnerCars(partnerId: string): Promise<PartnerCar[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('partner_cars')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    make: String(row.make),
    model: String(row.model),
    year: row.year === null || row.year === undefined ? null : Number(row.year),
    transmission: (row.transmission as PartnerCar['transmission']) ?? null,
    seats: row.seats === null || row.seats === undefined ? null : Number(row.seats),
    pricePerDay:
      row.price_per_day === null || row.price_per_day === undefined
        ? null
        : Number(row.price_per_day),
    city: String(row.city),
    description: row.description ? String(row.description) : null,
    photoUrls: photoUrls(row.photo_paths),
    approved: Boolean(row.approved),
  }));
}

export type CarInput = {
  make: string;
  model: string;
  year?: number;
  transmission?: 'manual' | 'automatic';
  seats?: number;
  pricePerDay?: number;
  city: string;
  description?: string;
  /** base64 images to upload alongside the listing. */
  photosBase64: string[];
};

/**
 * Creates a listing. It starts unapproved and stays invisible to tourists
 * until the admin approves it — the partner is told this in the dashboard.
 */
export async function createPartnerCar(partnerId: string, input: CarInput): Promise<boolean> {
  if (!supabase) return false;

  const paths: string[] = [];
  for (const base64 of input.photosBase64) {
    const path = `${partnerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: false });
    // One failed photo shouldn't lose the whole listing — keep what uploaded.
    if (!error) paths.push(path);
  }

  const { error } = await supabase.from('partner_cars').insert({
    partner_id: partnerId,
    make: input.make.trim(),
    model: input.model.trim(),
    year: input.year ?? null,
    transmission: input.transmission ?? null,
    seats: input.seats ?? null,
    price_per_day: input.pricePerDay ?? null,
    city: input.city.trim(),
    description: input.description?.trim() || null,
    photo_paths: paths,
  });
  return !error;
}

export async function deletePartnerCar(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('partner_cars').delete().eq('id', id);
  return !error;
}
