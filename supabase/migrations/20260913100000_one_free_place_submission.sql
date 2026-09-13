-- Every signed-in visitor may send one community map report for free. Further
-- reports require an active Premium entitlement. The decision is enforced in
-- a security-definer function so it cannot be bypassed by a modified client.

create table if not exists public.free_place_submission_uses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used_at timestamptz not null default now()
);

alter table public.free_place_submission_uses enable row level security;

-- Keep the submitter for future support/moderation while leaving historical
-- anonymous rows untouched. There is deliberately no user SELECT policy on
-- the base submissions table.
alter table public.place_submissions
  add column if not exists author_id uuid references auth.users(id) on delete set null;

create index if not exists place_submissions_author_id_idx
  on public.place_submissions(author_id);

create or replace function public.can_create_place_submission()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      public.has_premium(auth.uid())
      or not exists (
        select 1 from public.free_place_submission_uses
        where user_id = auth.uid()
      )
    );
$$;

-- Storage checks this too, so a visitor whose free report is already used
-- cannot upload another report photo. The final claim still happens below in
-- the same transaction as the report insert, which closes concurrent-submit
-- races.
create or replace function public.can_upload_place_submission_photo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_create_place_submission();
$$;

create or replace function public.create_place_submission(
  p_lat double precision,
  p_lng double precision,
  p_photo_path text,
  p_category text,
  p_submission_type text,
  p_rating integer,
  p_comment text,
  p_push_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  submitting_user_id uuid := auth.uid();
  submission_id uuid;
begin
  if submitting_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'INVALID_COORDINATES';
  end if;

  if coalesce(trim(p_photo_path), '') = '' then
    raise exception 'PHOTO_REQUIRED';
  end if;

  if p_category not in ('taxi', 'shop', 'restaurant', 'bar', 'exchange', 'street', 'school', 'atm', 'pharmacy', 'other') then
    raise exception 'INVALID_CATEGORY';
  end if;

  if p_submission_type not in ('positive', 'alert') then
    raise exception 'INVALID_SUBMISSION_TYPE';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING';
  end if;

  if not public.has_premium(submitting_user_id) then
    insert into public.free_place_submission_uses(user_id)
    values (submitting_user_id)
    on conflict (user_id) do nothing;

    if not found then
      raise exception 'FREE_PLACE_SUBMISSION_LIMIT_REACHED';
    end if;
  end if;

  insert into public.place_submissions(
    lat, lng, photo_path, category, submission_type, rating, comment, push_token, author_id
  ) values (
    p_lat, p_lng, trim(p_photo_path), p_category, p_submission_type, p_rating,
    nullif(trim(coalesce(p_comment, '')), ''), nullif(trim(coalesce(p_push_token, '')), ''), submitting_user_id
  ) returning id into submission_id;

  return submission_id;
end;
$$;

revoke all on function public.can_create_place_submission() from public;
revoke all on function public.can_upload_place_submission_photo() from public;
revoke all on function public.create_place_submission(double precision, double precision, text, text, text, integer, text, text) from public;
grant execute on function public.can_create_place_submission() to authenticated;
grant execute on function public.can_upload_place_submission_photo() to authenticated;
grant execute on function public.create_place_submission(double precision, double precision, text, text, text, integer, text, text) to authenticated;

-- Premium users remain covered by the existing policy. This additional policy
-- admits a free user's first photo only; the RPC above atomically records the
-- use when the report itself is created.
drop policy if exists "Eligible upload submitted place photos" on storage.objects;

create policy "Eligible upload submitted place photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submitted-place-photos'
    and public.can_upload_place_submission_photo()
  );
