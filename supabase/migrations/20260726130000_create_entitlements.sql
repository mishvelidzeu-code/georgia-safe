-- Georgia Safe — premium entitlements and the free Guardian allowance.
--
-- Both tables are READ-ONLY from the app. Nothing in the client can write
-- them: entitlements are written by the RevenueCat webhook and the free
-- counter is incremented by the guardian function, both using the service
-- role. A patched client therefore cannot grant itself premium or reset its
-- own allowance — which matters because every Guardian message costs money.
--
-- Why the expiry lives here at all: RevenueCat does NOT expire one-time
-- purchases. Its own docs are explicit that a consumable attached to an
-- entitlement stays unlocked forever, and that a non-renewing subscription's
-- duration "is not managed by Apple/StoreKit so you'll need to manage this
-- yourself". So the 5- and 10-day passes get their expiry computed by us, in
-- the webhook, and stored below.

create table if not exists public.entitlements (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  plan       text not null check (plan in ('pass_5d', 'pass_10d', 'monthly')),
  -- The single source of truth for "is this person premium right now".
  expires_at timestamptz not null,
  -- RevenueCat's app_user_id, kept for tracing a row back to a purchase when
  -- a customer asks about a charge.
  rc_user_id text,
  updated_at timestamptz not null default now()
);

create index if not exists entitlements_expiry_idx on public.entitlements (expires_at);

-- Counts the free Guardian messages a user has spent. Deliberately a lifetime
-- total, not a daily quota: a daily reset teaches people to wait until
-- tomorrow instead of subscribing, and over a week-long trip it adds up to
-- more free usage than the paid plan would ever sell.
create table if not exists public.guardian_usage (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  free_messages_used integer not null default 0 check (free_messages_used >= 0),
  updated_at         timestamptz not null default now()
);

alter table public.entitlements enable row level security;
alter table public.guardian_usage enable row level security;

-- Read-only, and only your own row. No insert/update/delete policy exists for
-- anyone but the service role, which bypasses RLS.
create policy "Users read own entitlement" on public.entitlements
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

create policy "Users read own usage" on public.guardian_usage
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

/**
 * True when the given user has an unexpired plan. Used by RLS policies on the
 * premium-only tables so the check lives in one place.
 */
create or replace function public.has_premium(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.entitlements
    where user_id = uid and expires_at > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Premium-gated writes.
--
-- Marking a place, writing a review and uploading a photo are premium. These
-- previously accepted anonymous inserts; now they require a signed-in user
-- with an active plan. Enforced here rather than only in the UI, because
-- storage and moderation are real costs and a hidden button is not a limit.
-- ---------------------------------------------------------------------------
drop policy if exists "Public insert access" on public.place_submissions;
create policy "Premium insert submissions" on public.place_submissions
  for insert to authenticated with check (public.has_premium(auth.uid()));

drop policy if exists "Public insert access" on public.place_reviews;
create policy "Premium insert reviews" on public.place_reviews
  for insert to authenticated with check (public.has_premium(auth.uid()));

-- Zone feedback (the "I felt safe here" buttons) stays free and anonymous:
-- it costs nothing to store, and it is the app's own data-quality signal —
-- charging for it would mean collecting less of it.

-- Photo uploads follow the same rule as the rows they belong to.
drop policy if exists "Anon upload submitted place photos" on storage.objects;
create policy "Premium upload submitted place photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'submitted-place-photos' and public.has_premium(auth.uid()));

drop policy if exists "Anon upload review photos" on storage.objects;
create policy "Premium upload review photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'place-review-photos' and public.has_premium(auth.uid()));
