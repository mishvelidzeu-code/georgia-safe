-- A visitor chooses the meaning of a map report. Positive reports are green
-- map recommendations; alerts are red and also appear in the Alerts feed.
-- Every report stays private until an administrator approves it.

alter table public.place_submissions
  add column if not exists submission_type text not null default 'positive';

alter table public.place_submissions
  drop constraint if exists place_submissions_submission_type_check;

alter table public.place_submissions
  add constraint place_submissions_submission_type_check
  check (submission_type in ('positive', 'alert'));

-- Historical map reports predate the explicit choice, so retain them as green
-- recommendations instead of accidentally presenting them as safety alerts.
update public.place_submissions
set submission_type = 'positive'
where submission_type is null or submission_type not in ('positive', 'alert');

-- A green recommendation does not expire. Red alerts retain the existing
-- seven-day expiry, and either kind can be hidden by an administrator.
alter table public.place_submissions
  alter column expires_at drop not null;

update public.place_submissions
set expires_at = null
where submission_type = 'positive';

create or replace view public.place_submissions_public as
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
  expires_at,
  submission_type
from public.place_submissions
where approved = true
  and resolved_at is null
  and (
    submission_type = 'positive'
    or (submission_type = 'alert' and expires_at > now())
  );

create or replace function public.admin_approve_place_submission(submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  update public.place_submissions
  set approved = true,
      resolved_at = null,
      expires_at = case
        when submission_type = 'alert' then now() + interval '7 days'
        else null
      end
  where id = submission_id;
end;
$$;

grant select on public.place_submissions_public to anon, authenticated;
grant execute on function public.admin_approve_place_submission(uuid) to authenticated;
