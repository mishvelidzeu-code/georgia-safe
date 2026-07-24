-- Georgia Safe — tourist-submitted places (Phase 4.5c, explicit user-requested
-- exception to CLAUDE.md rule 3 "no community features" — logged in
-- gegma.txt/CLAUDE.md as a deliberate override, decided by the user).
--
-- A tourist can long-press anywhere on the map, drop a pin, attach a photo,
-- and leave a 1-5 star rating + note. Unlike place_reviews (Phase 4.5b,
-- write-only/admin-only), this content becomes public:
--   - the pin location + photo appear on everyone's map IMMEDIATELY, unmoderated.
--   - the rating + written comment only become visible after an admin
--     approves the submission (via the Supabase dashboard, flipping
--     `approved` to true) — enforced by masking those two columns in the
--     `place_submissions_public` view below, not by the base table's RLS.
-- `push_token` exists purely so the submitter can be notified back when their
-- place is approved (see supabase/functions/notify-place-approval); it is
-- NEVER exposed through the public view and the base table has no public
-- SELECT policy, so no one (including other tourists) can read it back.

create table if not exists public.place_submissions (
  id         uuid primary key default gen_random_uuid(),
  lat        double precision not null,
  lng        double precision not null,
  photo_path text not null,
  rating     int  not null check (rating between 1 and 5),
  comment    text,
  approved   boolean not null default false,
  notified   boolean not null default false,
  push_token text,
  created_at timestamptz not null default now()
);

alter table public.place_submissions enable row level security;

-- Anonymous insert only — no name or device id, just the submission itself.
create policy "Public insert access" on public.place_submissions
  for insert to anon, authenticated with check (true);

-- No SELECT policy on the base table: the app reads through the view below,
-- never the table directly, so push_token/notified/approved-gated fields
-- never leak to the client.
create or replace view public.place_submissions_public as
select
  id,
  lat,
  lng,
  photo_path,
  approved,
  created_at,
  case when approved then rating  else null end as rating,
  case when approved then comment else null end as comment
from public.place_submissions;

grant select on public.place_submissions_public to anon, authenticated;

-- Public bucket: the photo must be visible immediately (before any admin
-- review), matching the pin's own immediate visibility.
insert into storage.buckets (id, name, public)
values ('submitted-place-photos', 'submitted-place-photos', true)
on conflict (id) do update set public = excluded.public;

create policy "Anon upload submitted place photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'submitted-place-photos');

create policy "Public read submitted place photos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'submitted-place-photos');
