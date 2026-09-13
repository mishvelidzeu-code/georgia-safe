-- Adds the "auto" (car) place-submission category. The app lists it between
-- Other and Taxi on the Alerts filter; the column constraint and both RPCs
-- that validate categories must accept it too.

alter table public.place_submissions
  drop constraint if exists place_submissions_category_check;

alter table public.place_submissions
  add constraint place_submissions_category_check
  check (category in (
    'auto', 'taxi', 'shop', 'restaurant', 'bar', 'exchange', 'street',
    'school', 'atm', 'pharmacy', 'other'
  ));

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

  if p_category not in ('auto', 'taxi', 'shop', 'restaurant', 'bar', 'exchange', 'street', 'school', 'atm', 'pharmacy', 'other') then
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

create or replace function public.admin_update_place_submission(
  p_submission_id uuid,
  p_category text,
  p_comment text,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'INVALID_COORDINATES';
  end if;

  if p_category not in ('auto', 'taxi', 'shop', 'restaurant', 'bar', 'exchange', 'street', 'school', 'atm', 'pharmacy', 'other') then
    raise exception 'INVALID_CATEGORY';
  end if;

  update public.place_submissions
  set
    category = p_category,
    comment = nullif(trim(coalesce(p_comment, '')), ''),
    lat = p_lat,
    lng = p_lng
  where id = p_submission_id;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;
end;
$$;
