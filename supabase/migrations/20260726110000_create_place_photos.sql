-- Georgia Safe — admin-curated photos for landmarks and safe places.
--
-- Distinct from the two photo flows that already exist:
--   * place_submissions.photo_path — a tourist's photo of a place they marked,
--     public, shown immediately.
--   * place_reviews.photo_path — a tourist's photo attached to a review,
--     private, never shown in the app.
-- This table is the third case: photos the ADMIN picks, shown to every tourist
-- in the info sheet when they tap a landmark or a safe place. Tourists can
-- read them but never write them, so nothing unmoderated can appear here.

create table if not exists public.place_photos (
  id         uuid primary key default gen_random_uuid(),
  -- Matches an id in landmarks.json or safe_places.json. Free text, not an FK:
  -- landmarks live only in the app bundle (there is no landmarks table), so a
  -- foreign key is impossible for half the rows this table holds.
  place_id   text not null,
  place_type text not null check (place_type in ('landmark', 'place')),
  photo_path text not null,
  created_at timestamptz not null default now()
);

-- The map looks photos up by (type, id) every time a sheet opens.
create index if not exists place_photos_place_idx
  on public.place_photos (place_type, place_id);

alter table public.place_photos enable row level security;

-- Everyone reads: these are curated, so there is nothing to gate.
create policy "Public read place photos" on public.place_photos
  for select to anon, authenticated using (true);

-- Only the admin writes (see 20260726100000_admin_access.sql for is_admin()).
create policy "Admin insert place photos" on public.place_photos
  for insert to authenticated with check (public.is_admin());

create policy "Admin delete place photos" on public.place_photos
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage. Public bucket: the image must load for every tourist, including
-- before sign-in, so signed URLs would only add latency and expiry bugs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;

create policy "Public read curated place photos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'place-photos');

create policy "Admin upload curated place photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'place-photos' and public.is_admin());

create policy "Admin delete curated place photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'place-photos' and public.is_admin());
