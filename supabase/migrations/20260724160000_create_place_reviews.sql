-- Georgia Safe — anonymous place reviews (Phase 4.5b)
-- Tourists can rate a specific place/object on the map (parks, shops,
-- landmarks, "safe places") with 1-5 stars, an optional written note, and an
-- optional photo. Like the zone feedback table this is intentionally
-- write-only from the app's perspective: there is NO select policy, so the
-- client never reads reviews back or shows them to other users — only an
-- admin (service role / Supabase dashboard) can read them. This is NOT a
-- community / trust-score feature (CLAUDE.md rule 3); it is private feedback
-- about places/objects, never about people (rule 4).

create table if not exists public.place_reviews (
  id         uuid primary key default gen_random_uuid(),
  place_id   text not null,
  place_type text not null check (place_type in ('landmark', 'place')),
  place_name text not null,
  rating     int  not null check (rating between 1 and 5),
  comment    text,
  photo_path text,
  created_at timestamptz not null default now()
);

alter table public.place_reviews enable row level security;

-- Anonymous insert only — no name, device id, or user id is ever stored.
create policy "Public insert access" on public.place_reviews
  for insert to anon, authenticated with check (true);

-- Private storage bucket for review photos. `public = false` → photos are
-- readable only via the service role / Supabase dashboard (admin-only),
-- matching the write-only, admin-reviewed model above.
insert into storage.buckets (id, name, public)
values ('place-review-photos', 'place-review-photos', false)
on conflict (id) do nothing;

-- Allow anonymous uploads into that bucket, but deliberately NO read/list/
-- update/delete policy — a tourist can attach a photo yet never browse others'.
create policy "Anon upload review photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'place-review-photos');
