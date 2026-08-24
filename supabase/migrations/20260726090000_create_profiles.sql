-- Georgia Safe — tourist profiles, filled in during onboarding (country for
-- the embassy link, name, visit length + how many times they've visited, age)
-- and owned by a Supabase Auth user.
--
-- Privacy: unlike every other table in this project so far (which is either
-- public-read reference data or write-only anonymous feedback), this one holds
-- PERSONAL data. So RLS is strictly per-user: a tourist can only ever see and
-- change their OWN row — there is no public read policy of any kind, and no
-- policy that lets one user read another's. The app never aggregates or
-- displays other people's profiles.
--
-- Note the app's rule (CLAUDE.md #4) that it never rates PEOPLE still holds:
-- this is the user's own account data, not an opinion about anyone.

create table if not exists public.profiles (
  -- Same id as the auth user, so a row can't exist without an account and is
  -- removed automatically when the account is deleted.
  id              uuid primary key references auth.users (id) on delete cascade,
  -- Matches an id from emergency.json's embassies list (e.g. 'usa') so the
  -- Emergency screen can show the right embassy. Free text rather than an FK:
  -- the embassy list ships in the app bundle and may include countries not yet
  -- seeded server-side.
  country_id      text,
  full_name       text,
  -- How long the trip is and whether this is their 1st, 2nd... visit.
  visit_length    text check (visit_length in ('days', 'week', 'weeks', 'month', 'longer')),
  visit_number    integer check (visit_number >= 1),
  age             integer check (age >= 13 and age <= 120),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each tourist sees and edits only their own profile. No public/anon access.
create policy "Users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy "Users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- No delete policy: account deletion cascades from auth.users instead, so a
-- profile can't be orphaned or removed while the account still exists.
