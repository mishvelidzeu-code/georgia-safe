-- Georgia Safe — rollback of the base-map POI recommendation feature (4.6).
-- The app no longer taps into base-map POIs at all: MapView reverted from
-- provider={PROVIDER_GOOGLE} back to the platform default (Apple Maps on
-- iOS), because only Google Maps ever reported onPoiClick to JS in the first
-- place. With that gone, recommended_places has no reader left in the app —
-- dropped rather than left as an orphaned table (CLAUDE.md: no dead code).
--
-- Safe to run whether or not 20260724190000_create_recommended_places.sql
-- was ever applied to this database (IF EXISTS).

drop table if exists public.recommended_places;
