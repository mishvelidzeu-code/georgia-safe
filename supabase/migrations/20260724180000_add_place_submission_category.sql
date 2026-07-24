-- Georgia Safe — place category for tourist-submitted places (Phase 4.5e).
-- Lets a tourist tag what a marked place actually is (shop, restaurant, bar,
-- school, ATM, pharmacy, or other) so the map can assign the right icon
-- automatically instead of a generic camera pin. Unlike rating/comment,
-- the category is NOT gated behind admin approval — it's a factual label
-- about what the place is, not an opinion, so it's exposed in the public
-- view unconditionally (default 'other' for any pre-existing rows).

alter table public.place_submissions
  add column if not exists category text not null default 'other'
  check (category in ('shop', 'restaurant', 'bar', 'school', 'atm', 'pharmacy', 'other'));

-- Recreate the public view to also expose `category` (unconditionally,
-- alongside lat/lng/photo_path — only rating/comment stay approval-gated).
-- `category` must be the LAST column in the SELECT list: Postgres only
-- allows CREATE OR REPLACE VIEW to append new columns, not insert them
-- before existing ones (it errors "cannot change name of view column ..."
-- if a later column shifts into an earlier one's position).
create or replace view public.place_submissions_public as
select
  id,
  lat,
  lng,
  photo_path,
  approved,
  created_at,
  case when approved then rating  else null end as rating,
  case when approved then comment else null end as comment,
  category
from public.place_submissions;

grant select on public.place_submissions_public to anon, authenticated;
