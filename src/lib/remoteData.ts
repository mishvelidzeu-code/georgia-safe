import { supabase } from './supabase';

// Shapes mirror src/data/*.json exactly (see supabase/migrations/
// 20260724090000_create_reference_tables.sql), so screens can consume either
// source identically. Nullable DB text columns are normalized to '' to match
// the local JSON's convention (e.g. an embassy with no listed phone).

function s(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// ---------------------------------------------------------------------------
// zones
// ---------------------------------------------------------------------------
export type ZoneLevel = 'green' | 'yellow' | 'red';

export type Zone = {
  id: string;
  name_en: string;
  name_ka: string;
  name_ru: string;
  day_score: number;
  night_score: number;
  day_level: ZoneLevel;
  night_level: ZoneLevel;
  lat: number;
  lng: number;
  tips_en: string[];
  tips_ka: string[];
  tips_ru: string[];
};

export async function fetchZones(): Promise<Zone[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('zones').select('*');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No zones returned');
  return data.map((row) => ({
    id: s(row.id),
    name_en: s(row.name_en),
    name_ka: s(row.name_ka),
    name_ru: s(row.name_ru),
    day_score: Number(row.day_score),
    night_score: Number(row.night_score),
    day_level: row.day_level as ZoneLevel,
    night_level: row.night_level as ZoneLevel,
    lat: Number(row.lat),
    lng: Number(row.lng),
    tips_en: Array.isArray(row.tips_en) ? (row.tips_en as string[]) : [],
    tips_ka: Array.isArray(row.tips_ka) ? (row.tips_ka as string[]) : [],
    tips_ru: Array.isArray(row.tips_ru) ? (row.tips_ru as string[]) : [],
  }));
}

// ---------------------------------------------------------------------------
// scams
// ---------------------------------------------------------------------------
export type ScamCategory = 'taxi' | 'bar' | 'exchange' | 'street' | 'shop';
export type Severity = 'low' | 'medium' | 'high';

export type Scam = {
  id: string;
  title_en: string;
  title_ka: string;
  title_ru: string;
  description_en: string;
  description_ka: string;
  description_ru: string;
  location_hint: string;
  location_hint_ka: string;
  location_hint_ru: string;
  severity: Severity;
  category: ScamCategory;
};

export async function fetchScams(): Promise<Scam[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('scams').select('*');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No scams returned');
  return data.map((row) => ({
    id: s(row.id),
    title_en: s(row.title_en),
    title_ka: s(row.title_ka),
    title_ru: s(row.title_ru),
    description_en: s(row.description_en),
    description_ka: s(row.description_ka),
    description_ru: s(row.description_ru),
    location_hint: s(row.location_hint),
    location_hint_ka: s(row.location_hint_ka),
    location_hint_ru: s(row.location_hint_ru),
    severity: row.severity as Severity,
    category: row.category as ScamCategory,
  }));
}

// ---------------------------------------------------------------------------
// safe_places
// ---------------------------------------------------------------------------
export type SafePlaceType = 'pharmacy24' | 'atm' | 'hospital' | 'police' | 'toilet';

export type SafePlace = {
  id: string;
  name: string;
  type: SafePlaceType;
  address: string;
  lat: number;
  lng: number;
  open_24h: boolean;
};

export async function fetchSafePlaces(): Promise<SafePlace[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('safe_places').select('*');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No safe places returned');
  return data.map((row) => ({
    id: s(row.id),
    name: s(row.name),
    type: row.type as SafePlaceType,
    address: s(row.address),
    lat: Number(row.lat),
    lng: Number(row.lng),
    open_24h: Boolean(row.open_24h),
  }));
}

// ---------------------------------------------------------------------------
// emergency (emergency_meta + emergency_police + emergency_hospitals +
// emergency_embassies recombined into the same nested shape as emergency.json)
// ---------------------------------------------------------------------------
export type EmergencyPolice = {
  id: string;
  name_en: string;
  address: string;
  phone: string;
  description_en: string;
  description_ka: string;
  description_ru: string;
};

export type EmergencyHospital = {
  id: string;
  name_en: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  notes_en: string;
  notes_ka: string;
  notes_ru: string;
};

export type EmergencyEmbassy = {
  id: string;
  country_en: string;
  address: string;
  phone: string;
};

export type EmergencyData = {
  note_en: string;
  note_ka: string;
  note_ru: string;
  national_number: string;
  national_number_description_en: string;
  national_number_description_ka: string;
  national_number_description_ru: string;
  health_hotline: {
    number: string;
    description_en: string;
    description_ka: string;
    description_ru: string;
  };
  police: EmergencyPolice[];
  tourist_info_center: {
    name_en: string;
    address: string;
    hours: string;
    description_en: string;
    description_ka: string;
    description_ru: string;
  };
  hospitals: EmergencyHospital[];
  embassies: EmergencyEmbassy[];
};

export async function fetchEmergency(): Promise<EmergencyData> {
  if (!supabase) throw new Error('Supabase not configured');

  const [metaRes, policeRes, hospitalsRes, embassiesRes] = await Promise.all([
    supabase.from('emergency_meta').select('*').eq('id', 1).single(),
    supabase.from('emergency_police').select('*'),
    supabase.from('emergency_hospitals').select('*'),
    supabase.from('emergency_embassies').select('*'),
  ]);

  if (metaRes.error) throw metaRes.error;
  if (policeRes.error) throw policeRes.error;
  if (hospitalsRes.error) throw hospitalsRes.error;
  if (embassiesRes.error) throw embassiesRes.error;

  const meta = metaRes.data;
  if (!meta || !policeRes.data?.length || !hospitalsRes.data?.length || !embassiesRes.data?.length) {
    throw new Error('Incomplete emergency data from Supabase');
  }

  return {
    note_en: s(meta.note_en),
    note_ka: s(meta.note_ka),
    note_ru: s(meta.note_ru),
    national_number: s(meta.national_number),
    national_number_description_en: s(meta.national_number_description_en),
    national_number_description_ka: s(meta.national_number_description_ka),
    national_number_description_ru: s(meta.national_number_description_ru),
    health_hotline: {
      number: s(meta.health_hotline_number),
      description_en: s(meta.health_hotline_description_en),
      description_ka: s(meta.health_hotline_description_ka),
      description_ru: s(meta.health_hotline_description_ru),
    },
    police: policeRes.data.map((row) => ({
      id: s(row.id),
      name_en: s(row.name_en),
      address: s(row.address),
      phone: s(row.phone),
      description_en: s(row.description_en),
      description_ka: s(row.description_ka),
      description_ru: s(row.description_ru),
    })),
    tourist_info_center: {
      name_en: s(meta.tourist_info_name_en),
      address: s(meta.tourist_info_address),
      hours: s(meta.tourist_info_hours),
      description_en: s(meta.tourist_info_description_en),
      description_ka: s(meta.tourist_info_description_ka),
      description_ru: s(meta.tourist_info_description_ru),
    },
    hospitals: hospitalsRes.data.map((row) => ({
      id: s(row.id),
      name_en: s(row.name_en),
      address: s(row.address),
      phone: s(row.phone),
      lat: Number(row.lat),
      lng: Number(row.lng),
      notes_en: s(row.notes_en),
      notes_ka: s(row.notes_ka),
      notes_ru: s(row.notes_ru),
    })),
    embassies: embassiesRes.data.map((row) => ({
      id: s(row.id),
      country_en: s(row.country_en),
      address: s(row.address),
      phone: s(row.phone),
    })),
  };
}
