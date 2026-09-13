-- Generic option for partner services that do not match a predefined type.
alter table public.partner_listings
  drop constraint if exists partner_listings_category_check;

alter table public.partner_listings
  add constraint partner_listings_category_check
  check (category in (
    'car_rental', 'bar_restaurant', 'currency_exchange', 'airport_transfer',
    'hotel', 'tour', 'other'
  ));
