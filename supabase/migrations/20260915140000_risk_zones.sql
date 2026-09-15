-- Georgia Safe — risk zones replace the scored district zones.
--
-- The old model rated every Tbilisi district 0-100 and painted the whole map
-- green/gold/red. The new model is the inverse: everywhere is unmarked by
-- default, and the administrator marks the exceptions — an orange (caution)
-- or red (high-risk) circle with a comment ("what is happening") that
-- expires on its own after the chosen duration (hours or days).
--
-- The old zones, the bundled zones.json and the votes cast on them are gone
-- for good (product decision 2026-09-15): none of it applies to time-limited
-- incidents, so nothing is migrated.

create table if not exists public.risk_zones (
  id          uuid primary key default gen_random_uuid(),
  level       text not null check (level in ('orange', 'red')),
  lat         double precision not null,
  lng         double precision not null,
  -- Three fixed sizes picked in the admin form (small / medium / large).
  radius_m    integer not null check (radius_m in (200, 400, 800)),
  comment_en  text not null default '',
  comment_ka  text not null default '',
  comment_ru  text not null default '',
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  check (expires_at > starts_at)
);

create index if not exists risk_zones_expires_at_idx on public.risk_zones (expires_at);

alter table public.risk_zones enable row level security;

-- Tourists only ever see zones that are active right now; an expired zone
-- disappears from the map without anyone having to delete it.
create policy "Public read active risk zones" on public.risk_zones
  for select to anon, authenticated using (expires_at > now());

create policy "Admin read risk zones" on public.risk_zones
  for select to authenticated using (public.is_admin());

create policy "Admin insert risk zones" on public.risk_zones
  for insert to authenticated with check (public.is_admin());

create policy "Admin update risk zones" on public.risk_zones
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Admin delete risk zones" on public.risk_zones
  for delete to authenticated using (public.is_admin());

-- Anonymous "I felt safe / unsafe here" votes, now attached to a risk zone.
-- Same write-only contract as before: the app inserts and never reads back
-- (no aggregate score for tourists — CLAUDE.md rule 3); the admin panel
-- reads the tallies. Votes vanish together with their zone.
create table if not exists public.zone_feedback (
  id         uuid primary key default gen_random_uuid(),
  zone_id    uuid not null references public.risk_zones(id) on delete cascade,
  vote       text not null check (vote in ('safe', 'unsafe')),
  created_at timestamptz not null default now()
);

alter table public.zone_feedback enable row level security;

create policy "Public insert zone feedback" on public.zone_feedback
  for insert to anon, authenticated with check (true);

create policy "Admin read zone feedback" on public.zone_feedback
  for select to authenticated using (public.is_admin());

-- Old model. `feedback` must go first — it references `zones`.
drop table if exists public.feedback;
drop table if exists public.zones;
