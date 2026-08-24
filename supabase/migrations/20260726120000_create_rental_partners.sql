-- Georgia Safe — car rental partners and their cars.
--
-- Flow: a company signs up in the app like anyone else and emails the admin.
-- The admin flips `approved` on their partner row from the admin panel; only
-- then does a Partner dashboard appear for them, and only then can their cars
-- be seen by tourists. Every car is approved separately, so a trusted partner
-- still cannot publish an unreviewed listing or photo.
--
-- Two independent gates, deliberately: `partners.approved` (is this company
-- real?) and `partner_cars.approved` (is this listing acceptable?).

create table if not exists public.partners (
  id           uuid primary key default gen_random_uuid(),
  -- One partner account per user. Cascade so removing the auth user removes
  -- the partner and, through partner_cars, their listings.
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  company_name text not null,
  -- Free text rather than an enum: partners operate in towns we have no zone
  -- data for, and the list will grow faster than migrations should.
  city         text not null,
  phone        text not null,
  -- Optional: falls back to `phone` when the company uses one number for both.
  whatsapp     text,
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.partner_cars (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.partners (id) on delete cascade,
  make          text not null,
  model         text not null,
  year          integer check (year between 1980 and 2100),
  transmission  text check (transmission in ('manual', 'automatic')),
  seats         integer check (seats between 1 and 20),
  price_per_day numeric(10, 2) check (price_per_day >= 0),
  -- Stored per car, not inherited from the partner: a company can have cars
  -- waiting in more than one city.
  city          text not null,
  description   text,
  -- Paths inside the `partner-cars` bucket. An array rather than a child
  -- table: a listing's photos are always read and written together.
  photo_paths   text[] not null default '{}',
  approved      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists partner_cars_partner_idx on public.partner_cars (partner_id);
create index if not exists partner_cars_city_idx on public.partner_cars (city) where approved;

alter table public.partners enable row level security;
alter table public.partner_cars enable row level security;

-- --- partners ---------------------------------------------------------------
-- A company creates its own pending row; it cannot approve itself because the
-- UPDATE policy below is admin-only.
create policy "Partner creates own row" on public.partners
  for insert to authenticated with check (auth.uid() = user_id);

create policy "Partner reads own row" on public.partners
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

create policy "Partner edits own details" on public.partners
  for update to authenticated
  using (auth.uid() = user_id and not approved)
  with check (auth.uid() = user_id and not approved);

create policy "Admin manages partners" on public.partners
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Admin deletes partners" on public.partners
  for delete to authenticated using (public.is_admin());

-- --- partner_cars -----------------------------------------------------------
-- Partners manage their own listings; approving is admin-only. Editing an
-- approved car is allowed, but see the trigger below — any edit sends it back
-- for review rather than letting approved content be swapped out silently.
create policy "Partner manages own cars" on public.partner_cars
  for all to authenticated
  using (
    partner_id in (select id from public.partners where user_id = auth.uid())
  )
  with check (
    partner_id in (select id from public.partners where user_id = auth.uid() and approved)
  );

create policy "Admin manages cars" on public.partner_cars
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tourists never read these tables directly — they read the view below.

-- --- re-review on edit ------------------------------------------------------
-- Without this, a partner could get a clean listing approved and then edit it
-- into something else. The admin's own updates are exempt, otherwise approving
-- would immediately un-approve.
create or replace function public.partner_car_needs_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.approved := false;
  end if;
  return new;
end;
$$;

drop trigger if exists partner_cars_reset_approval on public.partner_cars;
create trigger partner_cars_reset_approval
  before update on public.partner_cars
  for each row execute function public.partner_car_needs_review();

-- --- public view ------------------------------------------------------------
-- What a tourist sees: approved cars from approved partners, with the contact
-- details needed to call or message. Nothing else about the partner account is
-- exposed, and unapproved rows are unreachable rather than merely hidden.
create or replace view public.rental_cars_public as
select
  c.id,
  c.make,
  c.model,
  c.year,
  c.transmission,
  c.seats,
  c.price_per_day,
  c.city,
  c.description,
  c.photo_paths,
  p.company_name,
  p.phone,
  coalesce(p.whatsapp, p.phone) as whatsapp
from public.partner_cars c
join public.partners p on p.id = c.partner_id
where c.approved and p.approved;

grant select on public.rental_cars_public to anon, authenticated;

-- --- storage ----------------------------------------------------------------
-- Public bucket: car photos must load for every tourist. Uploads are limited
-- to signed-in users; the listing they belong to still needs admin approval
-- before anyone sees it.
insert into storage.buckets (id, name, public)
values ('partner-cars', 'partner-cars', true)
on conflict (id) do nothing;

create policy "Public read car photos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'partner-cars');

create policy "Partners upload car photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'partner-cars'
    and (public.is_admin() or exists (
      select 1 from public.partners where user_id = auth.uid() and approved
    ))
  );

create policy "Partners delete own car photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'partner-cars'
    and (public.is_admin() or exists (
      select 1 from public.partners where user_id = auth.uid() and approved
    ))
  );
