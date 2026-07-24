-- Georgia Safe — reference data schema (Phase 4.2)
-- Mirrors the static JSON in src/data/. All tables are public read-only
-- reference data: RLS is enabled with a SELECT-only policy for anon +
-- authenticated, and no INSERT/UPDATE/DELETE policies (the app never mutates
-- this data; it's seeded via migration and, later, edited only from the
-- Supabase dashboard / service role).
--
-- i18n: translatable fields are stored as flat _en/_ka/_ru sibling columns,
-- matching how the client already reads them (localizedField/localizedList).
-- With only 3 languages and read-only data, a separate translations table
-- would add join complexity for no benefit.

-- ---------------------------------------------------------------------------
-- zones
-- ---------------------------------------------------------------------------
create table if not exists public.zones (
  id           text primary key,
  name_en      text not null,
  name_ka      text,
  name_ru      text,
  day_score    integer not null,
  night_score  integer not null,
  day_level    text not null check (day_level in ('green', 'yellow', 'red')),
  night_level  text not null check (night_level in ('green', 'yellow', 'red')),
  lat          double precision not null,
  lng          double precision not null,
  tips_en      text[] not null default '{}',
  tips_ka      text[] not null default '{}',
  tips_ru      text[] not null default '{}'
);

-- ---------------------------------------------------------------------------
-- scams
-- ---------------------------------------------------------------------------
create table if not exists public.scams (
  id                text primary key,
  title_en          text not null,
  title_ka          text,
  title_ru          text,
  description_en     text not null,
  description_ka     text,
  description_ru     text,
  location_hint      text,
  location_hint_ka   text,
  location_hint_ru   text,
  severity           text not null check (severity in ('low', 'medium', 'high')),
  category           text not null check (category in ('taxi', 'bar', 'exchange', 'street', 'shop'))
);

-- ---------------------------------------------------------------------------
-- safe_places
-- ---------------------------------------------------------------------------
create table if not exists public.safe_places (
  id        text primary key,
  name      text not null,
  type      text not null check (type in ('pharmacy24', 'atm', 'hospital', 'police', 'toilet')),
  address   text,
  lat       double precision not null,
  lng       double precision not null,
  open_24h  boolean not null default false
);

-- ---------------------------------------------------------------------------
-- emergency_meta — singleton row for the top-level scalars / singletons of
-- emergency.json (note, national number, health hotline, tourist info center).
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_meta (
  id                                smallint primary key default 1,
  note_en                           text,
  note_ka                           text,
  note_ru                           text,
  national_number                   text not null,
  national_number_description_en    text,
  national_number_description_ka    text,
  national_number_description_ru    text,
  health_hotline_number             text,
  health_hotline_description_en     text,
  health_hotline_description_ka     text,
  health_hotline_description_ru     text,
  tourist_info_name_en              text,
  tourist_info_address              text,
  tourist_info_hours                text,
  tourist_info_description_en       text,
  tourist_info_description_ka       text,
  tourist_info_description_ru       text,
  constraint emergency_meta_single_row check (id = 1)
);

-- ---------------------------------------------------------------------------
-- emergency_police
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_police (
  id              text primary key,
  name_en         text not null,
  address         text,
  phone           text,
  description_en   text,
  description_ka   text,
  description_ru   text
);

-- ---------------------------------------------------------------------------
-- emergency_hospitals
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_hospitals (
  id        text primary key,
  name_en   text not null,
  address   text,
  phone     text,
  lat       double precision,
  lng       double precision,
  notes_en  text,
  notes_ka  text,
  notes_ru  text
);

-- ---------------------------------------------------------------------------
-- emergency_embassies
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_embassies (
  id           text primary key,
  country_en   text not null,
  address      text,
  phone        text
);

-- ---------------------------------------------------------------------------
-- Row Level Security — public read-only for every reference table.
-- ---------------------------------------------------------------------------
alter table public.zones                enable row level security;
alter table public.scams                enable row level security;
alter table public.safe_places          enable row level security;
alter table public.emergency_meta       enable row level security;
alter table public.emergency_police     enable row level security;
alter table public.emergency_hospitals  enable row level security;
alter table public.emergency_embassies  enable row level security;

create policy "Public read access" on public.zones
  for select to anon, authenticated using (true);
create policy "Public read access" on public.scams
  for select to anon, authenticated using (true);
create policy "Public read access" on public.safe_places
  for select to anon, authenticated using (true);
create policy "Public read access" on public.emergency_meta
  for select to anon, authenticated using (true);
create policy "Public read access" on public.emergency_police
  for select to anon, authenticated using (true);
create policy "Public read access" on public.emergency_hospitals
  for select to anon, authenticated using (true);
create policy "Public read access" on public.emergency_embassies
  for select to anon, authenticated using (true);
