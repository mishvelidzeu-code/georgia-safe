-- Georgia Safe — admin-curated recommended places (POI recommendations).
-- When a tourist taps a base-map POI (restaurant, park, shop, etc.) the app
-- shows whether an admin has marked that place as "recommended". This list is
-- admin-curated ONLY: anon/authenticated can SELECT (every tourist sees the
-- same recommendations), but there is NO insert/update/delete policy, so
-- tourists can never add or change a recommendation — the admin manages the
-- list from the Supabase dashboard.
--
-- This stays within the project rules: it is about places, never people
-- (CLAUDE.md rule 4), and it is a curated editorial list, not a crowd/community
-- vote or trust score (rule 3) — feedback the app already has (Phase 4.5) is
-- write-only; this is read-only and admin-written, the mirror image.

create table if not exists public.recommended_places (
  id         uuid primary key default gen_random_uuid(),
  -- Optional Google Maps POI id: when the admin records it, the app matches a
  -- tapped POI exactly. Usually the admin only records name + coordinates, so
  -- the app falls back to a small-radius proximity match (see
  -- src/lib/recommendedPlaces.ts::findRecommendation).
  place_id   text,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  -- Optional short "why recommended" note, shown under the badge if present.
  note_en    text,
  note_ka    text,
  note_ru    text,
  created_at timestamptz not null default now()
);

alter table public.recommended_places enable row level security;

-- Public read: every tourist sees the same admin-curated recommendations.
create policy "Public read access" on public.recommended_places
  for select to anon, authenticated using (true);

-- No insert/update/delete policy on purpose — only the admin (service role /
-- dashboard) can change the list. Anything not marked here is shown to the
-- tourist as "not recommended".
