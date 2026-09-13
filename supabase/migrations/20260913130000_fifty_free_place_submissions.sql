-- Temporary launch allowance: every non-Premium account may send up to fifty
-- community map reports. The counter is enforced in the same transaction as
-- the insert, so concurrent requests cannot exceed the allowance.
alter table public.free_place_submission_uses
  add column if not exists used_count integer not null default 0
    check (used_count >= 0);

-- Rows created by the former one-free-report version represent one accepted
-- report already, not zero. Keep that history when the counter is introduced.
update public.free_place_submission_uses
set used_count = 1
where used_count = 0;

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
      or coalesce((
        select used_count
        from public.free_place_submission_uses
        where user_id = auth.uid()
      ), 0) < 50
    );
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
  claimed_count integer;
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
    insert into public.free_place_submission_uses(user_id, used_at, used_count)
    values (submitting_user_id, now(), 1)
    on conflict (user_id) do update
      set used_count = public.free_place_submission_uses.used_count + 1,
          used_at = now()
      where public.free_place_submission_uses.used_count < 50
    returning used_count into claimed_count;

    if claimed_count is null then
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
revoke all on function public.create_place_submission(double precision, double precision, text, text, text, integer, text, text) from public;
grant execute on function public.can_create_place_submission() to authenticated;
grant execute on function public.create_place_submission(double precision, double precision, text, text, text, integer, text, text) to authenticated;
