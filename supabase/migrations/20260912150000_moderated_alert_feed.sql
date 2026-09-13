-- Tourist reports are public only after review. An approved alert remains
-- visible for seven days, unless the administrator marks it resolved sooner.

alter table public.place_submissions
  add column if not exists expires_at timestamptz,
  add column if not exists resolved_at timestamptz;

update public.place_submissions
set expires_at = created_at + interval '7 days'
where expires_at is null;

alter table public.place_submissions
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;

alter table public.place_submissions
  drop constraint if exists place_submissions_category_check;

alter table public.place_submissions
  add constraint place_submissions_category_check
  check (category in (
    'taxi', 'shop', 'restaurant', 'bar', 'exchange', 'street',
    'school', 'atm', 'pharmacy', 'other'
  ));

-- A later app version adds submission_type to this view. PostgreSQL cannot
-- remove that column with CREATE OR REPLACE VIEW, so recreate this early
-- transitional shape explicitly when applying the full migration history to
-- an already-updated project. The following migration immediately adds the
-- current final view shape again.
drop view if exists public.place_submissions_public;

-- Keep the original public columns in their existing order and append the
-- expiry value, so existing client queries remain compatible. The WHERE clause
-- is the security boundary for the Alert feed and map markers.
create view public.place_submissions_public as
select
  id,
  lat,
  lng,
  photo_path,
  approved,
  created_at,
  rating,
  comment,
  category,
  expires_at
from public.place_submissions
where approved = true
  and resolved_at is null
  and expires_at > now();

grant select on public.place_submissions_public to anon, authenticated;

create or replace function public.admin_approve_place_submission(submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  update public.place_submissions
  set approved = true,
      resolved_at = null,
      expires_at = now() + interval '7 days'
  where id = submission_id;
end;
$$;

create or replace function public.admin_resolve_place_submission(submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  update public.place_submissions
  set resolved_at = now()
  where id = submission_id and approved = true;
end;
$$;

grant execute on function public.admin_approve_place_submission(uuid) to authenticated;
grant execute on function public.admin_resolve_place_submission(uuid) to authenticated;
