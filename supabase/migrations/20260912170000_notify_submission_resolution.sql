-- Keep a separate one-time delivery marker for the notification sent when an
-- administrator resolves an alert or hides a positive map report.
alter table public.place_submissions
  add column if not exists resolved_notified boolean not null default false;
