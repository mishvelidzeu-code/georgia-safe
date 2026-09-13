-- Delivery is performed inside the database through pg_net, not by the
-- administrator's phone. This keeps approval notifications working even when
-- the administrator uses an older app version or has a poor connection.
create extension if not exists pg_net;

create or replace function public.admin_approve_place_submission(submission_id uuid)
returns void language plpgsql security definer set search_path = public, net as $$
declare
  submission record;
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  update public.place_submissions
  set approved = true,
      notified = false,
      resolved_at = null,
      expires_at = case
        when submission_type = 'alert' then now() + interval '7 days'
        else null
      end
  where id = submission_id
  returning submission_type, push_token into submission;

  if submission.push_token is not null then
    perform net.http_post(
      'https://exp.host/--/api/v2/push/send',
      jsonb_build_object(
        'to', submission.push_token,
        'title', case when submission.submission_type = 'alert' then 'თქვენი გაფრთხილება გამოქვეყნებულია' else 'თქვენი ადგილი რუკაზე გამოქვეყნებულია' end,
        'body', case when submission.submission_type = 'alert' then 'ადმინმა დაადასტურა თქვენი გაფრთხილება. ის უკვე ჩანს რუკაზე და Alerts გვერდზე.' else 'ადმინმა დაადასტურა თქვენი ადგილი. ის უკვე ჩანს რუკაზე მწვანე პინით.' end,
        'sound', 'default',
        'channelId', 'default'
      ),
      '{}'::jsonb,
      '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      10000
    );
    update public.place_submissions set notified = true where id = submission_id;
  end if;
end;
$$;

grant execute on function public.admin_approve_place_submission(uuid) to authenticated;

create or replace function public.admin_resolve_place_submission(submission_id uuid)
returns void language plpgsql security definer set search_path = public, net as $$
declare
  submission record;
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  update public.place_submissions
  set resolved_at = now(), resolved_notified = false
  where id = submission_id and approved = true and submission_type = 'alert'
  returning push_token into submission;

  if submission.push_token is not null then
    perform net.http_post(
      'https://exp.host/--/api/v2/push/send',
      jsonb_build_object(
        'to', submission.push_token,
        'title', 'თქვენი გაფრთხილება გადაწყდა',
        'body', 'ადმინმა მონიშნა, რომ თქვენ მიერ ატვირთული საკითხი მოგვარებულია.',
        'sound', 'default',
        'channelId', 'default'
      ),
      '{}'::jsonb,
      '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      10000
    );
    update public.place_submissions set resolved_notified = true where id = submission_id;
  end if;
end;
$$;

grant execute on function public.admin_resolve_place_submission(uuid) to authenticated;
