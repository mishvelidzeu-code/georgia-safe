-- General partner marketplace. Existing partners and partner_cars are retained;
-- cars are copied once into the new listing model.

alter table public.partners
  add column if not exists username text,
  add column if not exists active boolean not null default true,
  add column if not exists requires_password_change boolean not null default false;

create unique index if not exists partners_username_unique
  on public.partners (lower(username)) where username is not null;

create table if not exists public.partner_listings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  category text not null check (category in ('car_rental','bar_restaurant','currency_exchange','airport_transfer','hotel','tour')),
  title text not null,
  city text not null,
  address text,
  phone text,
  whatsapp text,
  working_hours text,
  price_description text,
  description text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  details jsonb not null default '{}'::jsonb,
  photo_paths text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','published','hidden','rejected')),
  review_status text check (review_status is null or review_status = 'pending'),
  pending_changes jsonb,
  rejection_reason text,
  legacy_car_id uuid unique references public.partner_cars(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.partner_listings (
  partner_id, category, title, city, description, details, photo_paths, status, legacy_car_id, created_at
)
select c.partner_id, 'car_rental', concat_ws(' ', c.make, c.model), c.city, c.description,
  jsonb_strip_nulls(jsonb_build_object(
    'make', c.make, 'model', c.model, 'year', c.year,
    'transmission', c.transmission, 'seats', c.seats, 'daily_price', c.price_per_day
  )),
  c.photo_paths,
  case when c.approved and p.approved then 'published' else 'pending' end,
  c.id,
  c.created_at
from public.partner_cars c
join public.partners p on p.id = c.partner_id
on conflict (legacy_car_id) do nothing;

create index if not exists partner_listings_partner_idx on public.partner_listings(partner_id);
create index if not exists partner_listings_public_idx on public.partner_listings(category, city)
  where status = 'published';

alter table public.partner_listings enable row level security;

create policy "Partners read own listings" on public.partner_listings
  for select to authenticated using (
    partner_id in (select id from public.partners where user_id = auth.uid()) or public.is_admin()
  );

create policy "Partners create pending listings" on public.partner_listings
  for insert to authenticated with check (
    partner_id in (select id from public.partners where user_id = auth.uid() and approved and active)
    and status = 'pending'
  );

create policy "Partners update own unpublished listings" on public.partner_listings
  for update to authenticated
  using (
    status <> 'published'
    and partner_id in (select id from public.partners where user_id = auth.uid() and approved and active)
  )
  with check (
    partner_id in (select id from public.partners where user_id = auth.uid() and approved and active)
    and status in ('pending','hidden')
  );

create policy "Partners delete own listings" on public.partner_listings
  for delete to authenticated using (
    partner_id in (select id from public.partners where user_id = auth.uid() and approved and active)
  );

create policy "Admin manages partner listings" on public.partner_listings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Published rows keep their currently approved public values while a partner's
-- proposed edit waits in pending_changes. This prevents an unreviewed address
-- or pin from replacing the public location.
create or replace function public.partner_submit_listing_update(listing_id uuid, changes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare current_status text;
begin
  select status into current_status from public.partner_listings
  where id = listing_id and partner_id in (
    select id from public.partners where user_id = auth.uid() and approved and active
  );
  if current_status is null then raise exception 'Listing not found'; end if;
  if current_status = 'published' then
    update public.partner_listings set pending_changes = changes, review_status = 'pending', updated_at = now()
    where id = listing_id;
  else
    update public.partner_listings set
      title = coalesce(changes->>'title', title), city = coalesce(changes->>'city', city),
      address = case when changes ? 'address' then changes->>'address' else address end,
      phone = case when changes ? 'phone' then changes->>'phone' else phone end,
      whatsapp = case when changes ? 'whatsapp' then changes->>'whatsapp' else whatsapp end,
      working_hours = case when changes ? 'working_hours' then changes->>'working_hours' else working_hours end,
      price_description = case when changes ? 'price_description' then changes->>'price_description' else price_description end,
      description = case when changes ? 'description' then changes->>'description' else description end,
      latitude = case when changes ? 'latitude' then (changes->>'latitude')::double precision else latitude end,
      longitude = case when changes ? 'longitude' then (changes->>'longitude')::double precision else longitude end,
      details = case when changes ? 'details' then changes->'details' else details end,
      status = 'pending', rejection_reason = null, updated_at = now()
    where id = listing_id;
  end if;
end; $$;
grant execute on function public.partner_submit_listing_update(uuid, jsonb) to authenticated;

create or replace function public.admin_approve_listing(listing_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  select pending_changes into c from public.partner_listings where id = listing_id;
  if c is not null then
    update public.partner_listings set
      title = coalesce(c->>'title', title), city = coalesce(c->>'city', city),
      address = case when c ? 'address' then c->>'address' else address end,
      phone = case when c ? 'phone' then c->>'phone' else phone end,
      whatsapp = case when c ? 'whatsapp' then c->>'whatsapp' else whatsapp end,
      working_hours = case when c ? 'working_hours' then c->>'working_hours' else working_hours end,
      price_description = case when c ? 'price_description' then c->>'price_description' else price_description end,
      description = case when c ? 'description' then c->>'description' else description end,
      latitude = case when c ? 'latitude' then (c->>'latitude')::double precision else latitude end,
      longitude = case when c ? 'longitude' then (c->>'longitude')::double precision else longitude end,
      details = case when c ? 'details' then c->'details' else details end,
      pending_changes = null, review_status = null, status = 'published', rejection_reason = null, updated_at = now()
    where id = listing_id;
  else
    update public.partner_listings set status = 'published', review_status = null, rejection_reason = null, updated_at = now()
    where id = listing_id;
  end if;
end; $$;
grant execute on function public.admin_approve_listing(uuid) to authenticated;

create or replace function public.admin_reject_listing_changes(listing_id uuid, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  update public.partner_listings set pending_changes = null, review_status = null,
    rejection_reason = nullif(trim(reason), ''), updated_at = now()
  where id = listing_id and status = 'published' and review_status = 'pending';
end; $$;
grant execute on function public.admin_reject_listing_changes(uuid, text) to authenticated;

create or replace view public.partner_listings_public as
select l.id, l.partner_id, l.category, l.title, l.city, l.address,
  coalesce(l.phone, p.phone) as phone,
  coalesce(l.whatsapp, p.whatsapp, l.phone, p.phone) as whatsapp,
  l.working_hours, l.price_description, l.description, l.latitude, l.longitude,
  l.details, l.photo_paths, l.status, l.rejection_reason, l.legacy_car_id,
  l.created_at, l.updated_at, p.company_name
from public.partner_listings l
join public.partners p on p.id = l.partner_id
where l.status = 'published' and p.approved and p.active;

grant select on public.partner_listings_public to anon, authenticated;

create or replace function public.complete_partner_password_change()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.partners set requires_password_change = false where user_id = auth.uid();
end;
$$;
grant execute on function public.complete_partner_password_change() to authenticated;
