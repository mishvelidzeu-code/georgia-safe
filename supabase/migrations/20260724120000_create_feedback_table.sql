-- Georgia Safe — anonymous zone feedback (Phase 4.5)
-- Tourists can tap "I felt safe here" / "I felt unsafe here" on a zone.
-- This is intentionally write-only from the app's perspective: there is no
-- SELECT policy, so the client never reads votes back or shows an aggregate
-- "trust score" — the app is tourist-only with no Local/Community features
-- (see CLAUDE.md rule 3). This table exists purely to collect anonymous
-- signal for later human/admin review via the Supabase dashboard.

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  zone_id    text not null references public.zones(id),
  vote       text not null check (vote in ('safe', 'unsafe')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Anonymous insert only — no name, device id, or user id is ever stored.
create policy "Public insert access" on public.feedback
  for insert to anon, authenticated with check (true);
