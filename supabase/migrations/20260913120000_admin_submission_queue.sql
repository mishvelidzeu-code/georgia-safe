-- The base table and profiles remain private. This function is the single
-- narrow route by which an administrator can see who sent a map report.
create or replace function public.admin_list_place_submissions()
returns table (
  id uuid,
  lat double precision,
  lng double precision,
  photo_path text,
  category text,
  submission_type text,
  approved boolean,
  push_token text,
  resolved_notified boolean,
  rating integer,
  comment text,
  created_at timestamptz,
  expires_at timestamptz,
  resolved_at timestamptz,
  author_id uuid,
  sender_name text,
  sender_email text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    submission.id,
    submission.lat,
    submission.lng,
    submission.photo_path,
    submission.category,
    submission.submission_type,
    submission.approved,
    submission.push_token,
    submission.resolved_notified,
    submission.rating,
    submission.comment,
    submission.created_at,
    submission.expires_at,
    submission.resolved_at,
    submission.author_id,
    nullif(trim(profile.full_name), '') as sender_name,
    auth_user.email as sender_email
  from public.place_submissions as submission
  left join public.profiles as profile on profile.id = submission.author_id
  left join auth.users as auth_user on auth_user.id = submission.author_id
  where public.is_admin()
  order by submission.created_at desc;
$$;

revoke all on function public.admin_list_place_submissions() from public;
grant execute on function public.admin_list_place_submissions() to authenticated;

-- Approved reports are still public map content, so edits are limited to the
-- factual fields the moderator can verify. The author and device token cannot
-- be changed through this endpoint.
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

  if p_category not in ('taxi', 'shop', 'restaurant', 'bar', 'exchange', 'street', 'school', 'atm', 'pharmacy', 'other') then
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

revoke all on function public.admin_update_place_submission(uuid, text, text, double precision, double precision) from public;
grant execute on function public.admin_update_place_submission(uuid, text, text, double precision, double precision) to authenticated;
