-- "Private taxi" and "Bike rental" join airport transfers as services
-- partners can list: a vehicle with photos that tourists browse on Getting
-- Around and book by WhatsApp. Only the category check changes; listings, approval and the
-- public view work exactly as for every other category.
alter table public.partner_listings
  drop constraint if exists partner_listings_category_check;

alter table public.partner_listings
  add constraint partner_listings_category_check
  check (category in (
    'car_rental', 'bar', 'restaurant', 'club', 'currency_exchange',
    'airport_transfer', 'private_taxi', 'bike_rental', 'hotel', 'tour', 'other'
  ));
