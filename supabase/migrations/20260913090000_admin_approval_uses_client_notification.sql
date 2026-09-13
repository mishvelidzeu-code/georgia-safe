-- The admin application sends the localized publication push immediately after
-- approval. Mark the legacy webhook delivery flag in the same secure update so
-- it cannot also send an older, duplicate generic notification.
create or replace function public.admin_approve_place_submission(submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  update public.place_submissions
  set approved = true,
      notified = true,
      resolved_at = null,
      expires_at = case
        when submission_type = 'alert' then now() + interval '7 days'
        else null
      end
  where id = submission_id;
end;
$$;

grant execute on function public.admin_approve_place_submission(uuid) to authenticated;
