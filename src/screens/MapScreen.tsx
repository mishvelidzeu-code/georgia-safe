import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LongPressEvent, PoiClickEvent } from 'react-native-maps';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import zonesData from '../data/zones.json';
import landmarksData from '../data/landmarks.json';
import safePlacesData from '../data/safe_places.json';
import { useLanguage } from '../i18n/LanguageContext';
import { localizedField, localizedList } from '../lib/localizeData';
import { fetchZones, fetchSafePlaces } from '../lib/remoteData';
import type { Zone, SafePlace, SafePlaceType } from '../lib/remoteData';
import { useRemoteData } from '../lib/useRemoteData';
import { submitZoneFeedback } from '../lib/feedback';
import type { ZoneVote } from '../lib/feedback';
import ReviewModal from '../components/ReviewModal';
import type { PlaceReviewType } from '../lib/placeReviews';
import NewPlaceModal from '../components/NewPlaceModal';
import LandmarkMarker from '../components/LandmarkMarker';
import { fetchPlaceSubmissions } from '../lib/placeSubmissions';
import { fetchPlacePhotos, photoKey } from '../lib/placePhotos';
import { usePremium } from '../premium/PremiumContext';
import type { PlacePhoto } from '../lib/placePhotos';
import type { PlaceSubmission, PlaceSubmissionCategory } from '../lib/placeSubmissions';
import { currentTimeOfDay, isEveningOrLater } from '../lib/guardianContext';
import { isInsideGeorgia } from '../lib/geography';
import { presentEveningZoneNotification } from '../lib/notifications';
import { startEveningZoneLiveActivity } from '../lib/liveActivity';
import {
  shouldSendEveningNudgeToday,
  getVisitedLandmarkIds,
  addVisitedLandmarkId,
  removeVisitedLandmarkId,
} from '../lib/storage';
import { initLandmarkGeofencing, refreshLandmarkGeofences } from '../lib/landmarkGeofencing';

type LandmarkCategory =
  | 'monument'
  | 'fortress'
  | 'church'
  | 'landmark'
  | 'square'
  | 'theatre'
  | 'market'
  | 'viewpoint'
  | 'park'
  | 'museum';

type Landmark = {
  id: string;
  name_en: string;
  name_ka: string;
  name_ru: string;
  category: LandmarkCategory;
  lat: number;
  lng: number;
  description_en: string;
  description_ka: string;
  description_ru: string;
};

type TimeMode = 'day' | 'night';

// A point of interest baked into the Google basemap (cafe, shop, hotel...).
// Google gives us only these three fields for free; anything richer (opening
// hours, rating, photos) would require a billed Places API call, which the app
// deliberately does not make.
type Poi = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
};

type Selection =
  | { type: 'zone'; zone: Zone }
  | { type: 'landmark'; landmark: Landmark }
  | { type: 'place'; place: SafePlace }
  | { type: 'submission'; submission: PlaceSubmission }
  | { type: 'poi'; poi: Poi };

const landmarks = landmarksData as Landmark[];

type ZoneTier = 'darkgreen' | 'green' | 'gold' | 'red';

// The score is the single source of truth for a zone's map color. User-defined
// bands: 80-100 dark green, 50-79 light green, 20-49 gold/orange, 0-19 red.
function scoreToTier(score: number): ZoneTier {
  if (score >= 80) return 'darkgreen';
  if (score >= 50) return 'green';
  if (score >= 20) return 'gold';
  return 'red';
}

// Four visually distinct bands (explicit hexes so the scale stays unambiguous
// regardless of the theme's semantic color names).
const TIER_COLORS: Record<ZoneTier, string> = {
  darkgreen: '#15803d',
  green: '#4ade80',
  gold: '#f59e0b',
  red: '#ef4444',
};

// Radius of the circle drawn for every zone, and therefore the catchment used
// when deciding which zone a tapped basemap POI belongs to.
const ZONE_RADIUS_M = 800;

const TIER_LABEL_KEYS: Record<ZoneTier, string> = {
  darkgreen: 'map.levelVerySafe',
  green: 'map.levelSafe',
  gold: 'map.levelCaution',
  red: 'map.levelRisk',
};

const CATEGORY_ICONS: Record<LandmarkCategory, keyof typeof Ionicons.glyphMap> = {
  monument: 'flag',
  fortress: 'shield',
  church: 'business',
  landmark: 'star',
  square: 'location',
  theatre: 'library',
  market: 'storefront',
  viewpoint: 'trail-sign',
  park: 'leaf',
  museum: 'home',
};

// Icon assigned automatically to a tourist-submitted place based on the
// category they picked in NewPlaceModal (mirrors NewPlaceModal's own
// CATEGORY_ICONS — kept separate since the two components' category sets
// are defined independently in lib/placeSubmissions.ts).
const SUBMISSION_CATEGORY_ICONS: Record<PlaceSubmissionCategory, keyof typeof Ionicons.glyphMap> = {
  shop: 'storefront',
  restaurant: 'restaurant',
  bar: 'beer',
  school: 'school',
  atm: 'cash',
  pharmacy: 'medkit',
  other: 'location',
};

const SUBMISSION_CATEGORY_LABEL_KEYS: Record<PlaceSubmissionCategory, string> = {
  shop: 'newPlace.categoryShop',
  restaurant: 'newPlace.categoryRestaurant',
  bar: 'newPlace.categoryBar',
  school: 'newPlace.categorySchool',
  atm: 'newPlace.categoryAtm',
  pharmacy: 'newPlace.categoryPharmacy',
  other: 'newPlace.categoryOther',
};

const LANDMARK_COLOR = '#f59e0b';

const PLACE_LABEL_KEYS: Record<SafePlaceType, string> = {
  pharmacy24: 'map.pharmacies',
  atm: 'map.atms',
  hospital: 'map.hospitals',
  police: 'map.police',
  toilet: 'map.toilets',
};

const PLACE_COLORS: Record<SafePlaceType, string> = {
  pharmacy24: '#14b8a6',
  atm: '#3b82f6',
  hospital: colors.risk,
  police: '#1d4ed8',
  toilet: '#8b5cf6',
};

const TBILISI_REGION = {
  latitude: 41.7151,
  longitude: 44.783,
  latitudeDelta: 0.16,
  longitudeDelta: 0.16,
};

// How often to re-pick the nearest 20 unvisited landmarks to geofence, as
// the tourist travels between regions (see landmarkGeofencing.ts).
const GEOFENCE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function PlaceIcon({ type, color }: { type: SafePlaceType; color: string }) {
  if (type === 'toilet') {
    return <MaterialCommunityIcons name="toilet" size={14} color={color} />;
  }
  const name: keyof typeof Ionicons.glyphMap =
    type === 'pharmacy24'
      ? 'medkit'
      : type === 'atm'
        ? 'cash'
        : type === 'hospital'
          ? 'medical'
          : 'shield';
  return <Ionicons name={name} size={14} color={color} />;
}

/**
 * Curated photos inside an info sheet. Renders nothing at all when a place has
 * none, so the great majority of pins keep their current compact layout.
 */
function PlacePhotoStrip({ photos }: { photos?: PlacePhoto[] }) {
  if (!photos || photos.length === 0) return null;
  return (
    <View style={styles.photoStrip}>
      {photos.map((photo) => (
        <Image
          key={photo.id}
          source={{ uri: photo.url }}
          style={styles.placePhoto}
          contentFit="cover"
          transition={150}
        />
      ))}
    </View>
  );
}

function withOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}

function openDirections(lat: number, lng: number, placeId?: string) {
  // Universal Google Maps URL — free, no API call, opens the Google Maps app
  // when installed and the website otherwise. `destination_place_id` is only
  // appended when we hold a real Google place ID (basemap POI taps); for our
  // own JSON pins the coordinates alone are the correct destination.
  // Requires internet — silently fails instead of throwing when offline.
  const base = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const url = placeId ? `${base}&destination_place_id=${encodeURIComponent(placeId)}` : base;
  Linking.openURL(url).catch(() => {});
}

function openInGoogleMaps(placeId: string, lat: number, lng: number) {
  // Place details page rather than a route — same free URL scheme.
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodeURIComponent(
    placeId,
  )}`;
  Linking.openURL(url).catch(() => {});
}

// Metres between two coordinates (haversine). Used only to match a tapped
// basemap POI against a safety zone, so the cheap spherical model is plenty.
function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Two markers on the exact same coordinate make Google Maps flicker: it has no
// stable rule for which to draw on top, so it swaps them on every redraw.
// Explicit, distinct zIndex values per layer remove the ambiguity.
const Z_INDEX = {
  zone: 1,
  landmark: 2,
  place: 3,
  submission: 4,
  newPin: 5,
} as const;

// A safe place sitting within this distance of a landmark is treated as
// overlapping it, and its pin is nudged sideways so both stay visible. Several
// entries in safe_places.json share a landmark's exact coordinate (the ATMs at
// Freedom Square and Rustaveli Theatre are at 0m), which is what stacked them.
const PIN_OVERLAP_M = 30;

// Anchor moves the pin image relative to its coordinate without touching the
// underlying data: the default rests the pin's tip on the point, the offset
// variant rests its left edge there, shifting it half a pin to the right.
const PIN_ANCHOR = { x: 0.5, y: 1 };
const PIN_ANCHOR_OFFSET = { x: 0, y: 1 };

// Closest zone whose drawn circle (ZONE_RADIUS_M) covers the point, or null
// when the point sits outside every zone we have data for.
function findZoneAt(lat: number, lng: number, zones: Zone[]): Zone | null {
  let closest: Zone | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    const distance = distanceMeters(lat, lng, zone.lat, zone.lng);
    if (distance <= ZONE_RADIUS_M && distance < closestDistance) {
      closest = zone;
      closestDistance = distance;
    }
  }
  return closest;
}

export default function MapScreen() {
  const { t, language } = useLanguage();
  const { premium, freeRemaining, showPaywall } = usePremium();
  const zones = useRemoteData(zonesData as Zone[], fetchZones);
  const safePlaces = useRemoteData(safePlacesData as SafePlace[], fetchSafePlaces);
  // Blue "you are here" dot on the map. Requesting the permission explicitly
  // (rather than just setting showsUserLocation) is required on Android for
  // the dot to ever appear; on iOS it also triggers the system prompt on
  // first launch instead of silently showing nothing. Denied/unavailable
  // just means no dot — never blocks the rest of the map.
  const [locationGranted, setLocationGranted] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (!cancelled) setLocationGranted(status === 'granted');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  // Tourist-submitted places (Phase 4.5c) — no local/offline fallback exists
  // for this dynamic, user-generated layer, so it starts empty and only
  // appears if/when Supabase is reachable. Managed directly (not via
  // useRemoteData, which only fetches once per mount) so a successful new
  // submission can trigger an immediate re-fetch to show the new pin.
  // Admin-curated photos for landmarks and safe places, fetched once and kept
  // as a lookup table — a sheet must be able to show its photos the instant it
  // opens, not after a per-place round trip. Empty until Supabase answers;
  // sheets simply render without photos in the meantime.
  const [placePhotos, setPlacePhotos] = useState<Record<string, PlacePhoto[]>>({});
  useEffect(() => {
    let cancelled = false;
    fetchPlacePhotos()
      .then((map) => {
        if (!cancelled) setPlacePhotos(map);
      })
      .catch(() => {
        // Offline — the sheets just show no photos.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [submittedPlaces, setSubmittedPlaces] = useState<PlaceSubmission[]>([]);
  const refreshSubmittedPlaces = useCallback(() => {
    fetchPlaceSubmissions()
      .then(setSubmittedPlaces)
      .catch(() => {
        // Offline/unreachable — keep showing whatever was last loaded.
      });
  }, []);
  useEffect(() => {
    refreshSubmittedPlaces();
  }, [refreshSubmittedPlaces]);
  // 6.3: default to Night mode automatically if it's currently night
  // (22:00-05:59, same threshold as guardianContext.ts) — the toggle below
  // still lets the user override it manually either way.
  const [mode, setMode] = useState<TimeMode>(() =>
    currentTimeOfDay() === 'night' ? 'night' : 'day',
  );
  const [showAutoNightToast, setShowAutoNightToast] = useState(
    () => currentTimeOfDay() === 'night',
  );

  useEffect(() => {
    if (!showAutoNightToast) return;
    const timeout = setTimeout(() => setShowAutoNightToast(false), 5000);
    return () => clearTimeout(timeout);
  }, [showAutoNightToast]);
  // Zones are hidden by day (clean sightseeing map) and switch on automatically
  // from 19:00 through the night — the layers panel below still lets the user
  // toggle them manually either way.
  const [showZones, setShowZones] = useState(() => isEveningOrLater());
  const [showEveningToast, setShowEveningToast] = useState(() => isEveningOrLater());
  // Explains why the map is showing Tbilisi instead of where the user is.
  // Unlike the evening/night toasts this one has no timer — it describes a
  // state that is still true a minute later, so it stays until dismissed.
  const [showAbroadToast, setShowAbroadToast] = useState(false);

  useEffect(() => {
    if (!isEveningOrLater()) return;
    shouldSendEveningNudgeToday().then((shouldSend) => {
      if (!shouldSend) return;
      presentEveningZoneNotification(t('map.eveningNotifTitle'), t('map.eveningNotifBody'));
      startEveningZoneLiveActivity(t('map.eveningNotifTitle'), t('map.eveningZonesOn'));
    });
    const timeout = setTimeout(() => setShowEveningToast(false), 6000);
    return () => clearTimeout(timeout);
  }, [t]);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [placeVisibility, setPlaceVisibility] = useState<Record<SafePlaceType, boolean>>({
    pharmacy24: true,
    atm: true,
    hospital: true,
    police: true,
    toilet: true,
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    id: string;
    type: PlaceReviewType;
    name: string;
  } | null>(null);
  const [newPlacePin, setNewPlacePin] = useState<{ lat: number; lng: number } | null>(null);

  const handleMapLongPress = useCallback(
    (e: LongPressEvent) => {
      // Marking a place is premium: it costs storage and it costs the admin a
      // moderation decision. Blocked here and again by RLS on the insert.
      if (!premium) {
        showPaywall('contribute');
        return;
      }
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setNewPlacePin({ lat: latitude, lng: longitude });
    },
    [premium, showPaywall],
  );

  // Tap on a POI drawn by Google itself (cafe, hotel, shop). We show the name
  // Google gives us plus our own safety reading for the zone it falls in —
  // the part of the sheet that no map app provides.
  //
  // Gated by the same free allowance as the assistant: once it is spent, the
  // tap opens the paywall instead. Deliberately limited to Google's own POIs —
  // our safety layers (zones, landmarks, pharmacies, ATMs, hospitals, police)
  // stay free for everyone, which is what the paywall itself promises.
  const handlePoiClick = useCallback(
    (e: PoiClickEvent) => {
      if (!premium && freeRemaining <= 0) {
        showPaywall('poi');
        return;
      }
      const { placeId, name, coordinate } = e.nativeEvent;
      setSelection({
        type: 'poi',
        poi: {
          placeId,
          name,
          lat: coordinate.latitude,
          lng: coordinate.longitude,
        },
      });
      bottomSheetRef.current?.expand();
    },
    [premium, freeRemaining, showPaywall],
  );

  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['38%'], []);
  // Dimmed backdrop behind the info sheet — tapping it (anywhere on the map
  // outside the sheet) closes the sheet, same as swiping it down or hitting
  // an explicit close button.
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  // Center the map on the tourist's actual location on launch, instead of
  // always opening on Tbilisi — if they're in Batumi, the map should open
  // on Batumi. Runs once, right after the permission effect above resolves
  // to granted. TBILISI_REGION (passed as initialRegion) stays as the
  // fallback first paint and for denied/unavailable location.
  //
  // Outside Georgia we deliberately do NOT follow the location: every pin,
  // zone and landmark this app has is Georgian, so centering on someone's
  // home town abroad (or on an App Store reviewer's desk) produces a blank
  // map that reads as a broken app. They stay on Tbilisi and get told why.
  useEffect(() => {
    if (!locationGranted) return;
    let cancelled = false;
    Location.getCurrentPositionAsync({})
      .then((position) => {
        if (cancelled) return;
        const { latitude, longitude } = position.coords;
        if (!isInsideGeorgia(latitude, longitude)) {
          setShowAbroadToast(true);
          return;
        }
        mapRef.current?.animateToRegion(
          { latitude, longitude, latitudeDelta: 0.16, longitudeDelta: 0.16 },
          400,
        );
      })
      .catch(() => {
        // Unavailable — keep showing the Tbilisi fallback region.
      });
    return () => {
      cancelled = true;
    };
  }, [locationGranted]);

  // Landmark "visited" tracking (arrival geofencing) — see
  // src/lib/landmarkGeofencing.ts. Loads persisted state on mount, starts
  // background geofencing once location is granted (best-effort — never
  // blocks the rest of the map if the tourist declines "Always" permission),
  // and periodically refreshes which landmarks are being watched as they
  // move between regions (iOS caps simultaneously monitored regions at 20,
  // so we can't just watch all of them at once).
  const [visitedLandmarkIds, setVisitedLandmarkIds] = useState<Set<string>>(new Set());
  const [justVisitedId, setJustVisitedId] = useState<string | null>(null);

  useEffect(() => {
    getVisitedLandmarkIds().then((ids) => setVisitedLandmarkIds(new Set(ids)));
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('landmarkVisited', (id: string) => {
      setVisitedLandmarkIds((prev) => new Set(prev).add(id));
      setJustVisitedId(id);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!locationGranted) return;
    let cancelled = false;
    initLandmarkGeofencing();
    const interval = setInterval(() => {
      Location.getCurrentPositionAsync({})
        .then((position) => {
          if (!cancelled) {
            refreshLandmarkGeofences(position.coords.latitude, position.coords.longitude);
          }
        })
        .catch(() => {});
    }, GEOFENCE_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [locationGranted]);

  const circles = useMemo(
    () =>
      zones.map((zone) => {
        const score = mode === 'day' ? zone.day_score : zone.night_score;
        return { zone, color: TIER_COLORS[scoreToTier(score)] };
      }),
    [zones, mode],
  );

  const handleZonePress = useCallback((zone: Zone) => {
    setSelection({ type: 'zone', zone });
    setFeedbackGiven(false);
    bottomSheetRef.current?.expand();
  }, []);

  const handleZoneFeedback = useCallback((zoneId: string, vote: ZoneVote) => {
    // Optimistic: the vote is anonymous and non-critical, so the tourist
    // sees the thank-you immediately regardless of connectivity — the
    // request itself just fails silently offline (see submitZoneFeedback).
    setFeedbackGiven(true);
    submitZoneFeedback(zoneId, vote);
  }, []);

  // Manual override for the "visited" state, from the landmark sheet. The
  // geofence only fires if the tourist actually walks into the region, so a
  // place they drove past (or one the 70m geofence missed) can be ticked off
  // by hand — and a wrongly marked one put back to unvisited. Re-registering
  // the geofences afterwards matters: only unvisited landmarks are watched,
  // so an un-marked place must start being watched again.
  const handleToggleVisited = useCallback(
    (landmarkId: string) => {
      const nowVisited = !visitedLandmarkIds.has(landmarkId);
      setVisitedLandmarkIds((prev) => {
        const next = new Set(prev);
        if (nowVisited) next.add(landmarkId);
        else next.delete(landmarkId);
        return next;
      });
      // No arrival animation on a manual tick — that flash means "you just
      // got here", which is exactly what didn't happen.
      setJustVisitedId((current) => (current === landmarkId ? null : current));
      const persisted = nowVisited
        ? addVisitedLandmarkId(landmarkId)
        : removeVisitedLandmarkId(landmarkId);
      persisted.then(() => {
        if (!locationGranted) return;
        Location.getCurrentPositionAsync({})
          .then((position) =>
            refreshLandmarkGeofences(position.coords.latitude, position.coords.longitude),
          )
          .catch(() => {});
      });
    },
    [visitedLandmarkIds, locationGranted],
  );

  const handleLandmarkPress = useCallback((landmark: Landmark) => {
    setSelection({ type: 'landmark', landmark });
    mapRef.current?.animateToRegion(
      {
        latitude: landmark.lat,
        longitude: landmark.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      400,
    );
    bottomSheetRef.current?.expand();
  }, []);

  const handlePlacePress = useCallback((place: SafePlace) => {
    setSelection({ type: 'place', place });
    bottomSheetRef.current?.expand();
  }, []);

  const handleCenterOnMe = useCallback(async () => {
    try {
      let granted = locationGranted;
      if (!granted) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
        setLocationGranted(granted);
      }
      if (!granted) return;
      const position = await Location.getCurrentPositionAsync({});
      // An explicit "take me to where I am" is still honoured abroad — but
      // the hint comes along, so an empty screen isn't a mystery.
      if (!isInsideGeorgia(position.coords.latitude, position.coords.longitude)) {
        setShowAbroadToast(true);
      }
      mapRef.current?.animateToRegion(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          // Tighter than the landmark zoom (0.01) — this is a direct "take me
          // to exactly where I am" action, so it should feel noticeably closer.
          latitudeDelta: 0.004,
          longitudeDelta: 0.004,
        },
        400,
      );
    } catch {
      // Location unavailable/denied — silently no-op, matches the rest of
      // the app's offline-first, never-block-on-location philosophy.
    }
  }, [locationGranted]);

  const togglePlaceType = useCallback((type: SafePlaceType, value: boolean) => {
    setPlaceVisibility((prev) => ({ ...prev, [type]: value }));
  }, []);

  const selectedZoneScore =
    selection?.type === 'zone'
      ? mode === 'day'
        ? selection.zone.day_score
        : selection.zone.night_score
      : null;
  const selectedZoneTier =
    selectedZoneScore !== null ? scoreToTier(selectedZoneScore) : null;

  // Safety reading for a tapped basemap POI: the zone it sits in, scored for
  // the currently selected time of day. Null when the POI is outside every
  // zone we have data for — the sheet then says so rather than guessing.
  const poiZone = useMemo(
    () =>
      selection?.type === 'poi'
        ? findZoneAt(selection.poi.lat, selection.poi.lng, zones)
        : null,
    [selection, zones],
  );
  const poiZoneScore = poiZone
    ? mode === 'day'
      ? poiZone.day_score
      : poiZone.night_score
    : null;
  const poiZoneTier = poiZoneScore !== null ? scoreToTier(poiZoneScore) : null;

  // Safe places whose pin would land on top of a landmark pin. Computed from
  // the data rather than hardcoded ids, so any future entry that collides is
  // nudged automatically.
  const overlappingPlaceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const place of safePlaces) {
      const collides = landmarks.some(
        (landmark) =>
          distanceMeters(place.lat, place.lng, landmark.lat, landmark.lng) < PIN_OVERLAP_M,
      );
      if (collides) ids.add(place.id);
    }
    return ids;
  }, [safePlaces]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        // Google Maps on both platforms: iOS defaults to Apple Maps, whose
        // built-in POIs are drawn but not tappable (no onPoiClick). Google's
        // are tappable, which is what feeds the POI sheet below. Mobile map
        // loads are not billed.
        provider={PROVIDER_GOOGLE}
        initialRegion={TBILISI_REGION}
        onLongPress={handleMapLongPress}
        onPoiClick={handlePoiClick}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
      >
        {showZones &&
          circles.map(({ zone, color }) => (
            <Circle
              key={zone.id}
              center={{ latitude: zone.lat, longitude: zone.lng }}
              radius={ZONE_RADIUS_M}
              fillColor={withOpacity(color, 0.25)}
              strokeColor={color}
              strokeWidth={2}
            />
          ))}

        {showZones &&
          circles.map(({ zone, color }) => (
            <Marker
              key={`${zone.id}-marker`}
              coordinate={{ latitude: zone.lat, longitude: zone.lng }}
              tracksViewChanges={false}
              zIndex={Z_INDEX.zone}
              onPress={() => handleZonePress(zone)}
            >
              <View style={[styles.zoneDot, { backgroundColor: color }]} />
            </Marker>
          ))}

        {showLandmarks &&
          landmarks.map((landmark) => (
            <LandmarkMarker
              key={landmark.id}
              lat={landmark.lat}
              lng={landmark.lng}
              title={localizedField(landmark, 'name', language)}
              icon={CATEGORY_ICONS[landmark.category]}
              color={LANDMARK_COLOR}
              visited={visitedLandmarkIds.has(landmark.id)}
              justVisited={justVisitedId === landmark.id}
              selected={selection?.type === 'landmark' && selection.landmark.id === landmark.id}
              zIndex={Z_INDEX.landmark}
              onAnimationDone={() =>
                setJustVisitedId((current) => (current === landmark.id ? null : current))
              }
              onPress={() => handleLandmarkPress(landmark)}
            />
          ))}

        {safePlaces
          .filter((place) => placeVisibility[place.type])
          .map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.lat, longitude: place.lng }}
              anchor={overlappingPlaceIds.has(place.id) ? PIN_ANCHOR_OFFSET : PIN_ANCHOR}
              tracksViewChanges={false}
              zIndex={Z_INDEX.place}
              onPress={() => handlePlacePress(place)}
            >
              <View style={styles.pinContainer}>
                <View
                  style={[styles.placeBubble, { backgroundColor: PLACE_COLORS[place.type] }]}
                >
                  <PlaceIcon type={place.type} color={colors.white} />
                </View>
                <View
                  style={[styles.pinArrow, { borderTopColor: PLACE_COLORS[place.type] }]}
                />
              </View>
            </Marker>
          ))}

        {submittedPlaces.map((submission) => (
          <Marker
            key={submission.id}
            coordinate={{ latitude: submission.lat, longitude: submission.lng }}
            anchor={PIN_ANCHOR}
            tracksViewChanges={false}
            zIndex={Z_INDEX.submission}
            onPress={() => {
              setSelection({ type: 'submission', submission });
              bottomSheetRef.current?.expand();
            }}
          >
            <View style={styles.pinContainer}>
              <View
                style={[
                  styles.submissionBubble,
                  !submission.approved && styles.submissionBubblePending,
                ]}
              >
                <Ionicons
                  name={SUBMISSION_CATEGORY_ICONS[submission.category]}
                  size={13}
                  color={colors.white}
                />
              </View>
              <View
                style={[
                  styles.pinArrow,
                  {
                    borderTopColor: submission.approved ? '#a855f7' : colors.textMuted,
                  },
                ]}
              />
            </View>
          </Marker>
        ))}

        {newPlacePin && (
          <Marker
            coordinate={{ latitude: newPlacePin.lat, longitude: newPlacePin.lng }}
            anchor={PIN_ANCHOR}
            zIndex={Z_INDEX.newPin}
            pinColor={colors.safe}
          />
        )}
      </MapView>

      <View style={styles.toggle}>
        <Pressable
          style={[styles.toggleButton, mode === 'day' && styles.toggleButtonActive]}
          onPress={() => setMode('day')}
        >
          <Text style={[styles.toggleText, mode === 'day' && styles.toggleTextActive]}>
            {t('map.day')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, mode === 'night' && styles.toggleButtonActive]}
          onPress={() => setMode('night')}
        >
          <Text style={[styles.toggleText, mode === 'night' && styles.toggleTextActive]}>
            {t('map.night')}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.layersButton}
        onPress={() => {
          setLegendOpen(false);
          setLayersOpen((open) => !open);
        }}
      >
        <Ionicons name="layers" size={22} color={colors.text} />
      </Pressable>

      <Pressable
        style={styles.legendButton}
        onPress={() => {
          setLayersOpen(false);
          setLegendOpen((open) => !open);
        }}
      >
        <Ionicons name="information-circle" size={22} color={colors.text} />
      </Pressable>

      <Pressable style={styles.locateButtonBottom} onPress={handleCenterOnMe}>
        <Ionicons name="locate" size={22} color={colors.white} />
      </Pressable>

      {(showEveningToast || showAutoNightToast || showAbroadToast) && (
        <View style={styles.toastStack} pointerEvents="box-none">
          {showAbroadToast && (
            <View style={styles.infoToast}>
              <Ionicons name="airplane" size={14} color={colors.text} />
              <Text style={styles.infoToastText}>{t('map.outsideGeorgia')}</Text>
              <Pressable onPress={() => setShowAbroadToast(false)} hitSlop={8}>
                <Ionicons name="close" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          )}
          {showEveningToast && (
            <View style={styles.infoToast}>
              <Ionicons name="shield-checkmark" size={14} color={colors.safe} />
              <Text style={styles.infoToastText}>{t('map.eveningZonesOn')}</Text>
              <Pressable onPress={() => setShowEveningToast(false)} hitSlop={8}>
                <Ionicons name="close" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          )}
          {showAutoNightToast && (
            <View style={styles.infoToast}>
              <Ionicons name="moon" size={14} color={colors.text} />
              <Text style={styles.infoToastText}>{t('map.autoNightMode')}</Text>
              <Pressable onPress={() => setShowAutoNightToast(false)} hitSlop={8}>
                <Ionicons name="close" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      {layersOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setLayersOpen(false)} />
      )}

      {layersOpen && (
        <View style={styles.layersPanel}>
          <View style={styles.layerRow}>
            <Text style={styles.layerLabel}>{t('map.safetyZones')}</Text>
            <Switch
              value={showZones}
              onValueChange={setShowZones}
              trackColor={{ false: colors.border, true: colors.safe }}
            />
          </View>
          <View style={styles.layerRow}>
            <Text style={styles.layerLabel}>{t('map.landmarks')}</Text>
            <Switch
              value={showLandmarks}
              onValueChange={setShowLandmarks}
              trackColor={{ false: colors.border, true: colors.safe }}
            />
          </View>
          <View style={styles.layerDivider} />
          {(Object.keys(PLACE_LABEL_KEYS) as SafePlaceType[]).map((type) => (
            <View key={type} style={styles.layerRow}>
              <Text style={styles.layerLabel}>{t(PLACE_LABEL_KEYS[type])}</Text>
              <Switch
                value={placeVisibility[type]}
                onValueChange={(value) => togglePlaceType(type, value)}
                trackColor={{ false: colors.border, true: colors.safe }}
              />
            </View>
          ))}
        </View>
      )}

      {legendOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setLegendOpen(false)} />
      )}

      {legendOpen && (
        <View style={styles.legendPanel}>
          <Text style={styles.legendTitle}>{t('map.legendTitle')}</Text>
          {(['darkgreen', 'green', 'gold', 'red'] as ZoneTier[]).map((tier) => (
            <View key={tier} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: TIER_COLORS[tier] }]} />
              <View style={styles.legendTextBlock}>
                <Text style={styles.legendLabel}>{t(TIER_LABEL_KEYS[tier])}</Text>
                <Text style={styles.legendRange}>{t(`map.legendRange${tier}`)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetScrollView
          style={styles.sheetContent}
          contentContainerStyle={styles.sheetContentContainer}
          showsVerticalScrollIndicator={false}
        >
          {selection?.type === 'zone' && selectedZoneTier && selectedZoneScore !== null && (
            <>
              <Text style={styles.sheetTitle}>
                {localizedField(selection.zone, 'name', language)}
              </Text>
              <View style={styles.scoreRow}>
                <View
                  style={[styles.levelDot, { backgroundColor: TIER_COLORS[selectedZoneTier] }]}
                />
                <Text style={styles.sheetScore}>
                  {selectedZoneScore}/100 · {t(TIER_LABEL_KEYS[selectedZoneTier])}
                </Text>
              </View>
              {localizedList(selection.zone, 'tips', language).map((tip) => (
                <Text key={tip} style={styles.tip}>
                  • {tip}
                </Text>
              ))}
              {feedbackGiven ? (
                <Text style={styles.feedbackThanks}>{t('map.feedbackThanks')}</Text>
              ) : (
                <View style={styles.feedbackRow}>
                  <Pressable
                    style={[styles.feedbackButton, styles.feedbackButtonSafe]}
                    onPress={() => handleZoneFeedback(selection.zone.id, 'safe')}
                  >
                    <Ionicons name="thumbs-up" size={16} color={colors.background} />
                    <Text style={styles.feedbackButtonText}>{t('map.feltSafe')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.feedbackButton, styles.feedbackButtonUnsafe]}
                    onPress={() => handleZoneFeedback(selection.zone.id, 'unsafe')}
                  >
                    <Ionicons name="thumbs-down" size={16} color={colors.background} />
                    <Text style={styles.feedbackButtonText}>{t('map.feltUnsafe')}</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          {selection?.type === 'landmark' && (
            <>
              <Text style={styles.sheetTitle}>
                {localizedField(selection.landmark, 'name', language)}
              </Text>
              <Text style={styles.landmarkDescription}>
                {localizedField(selection.landmark, 'description', language)}
              </Text>
              <PlacePhotoStrip photos={placePhotos[photoKey('landmark', selection.landmark.id)]} />
              <Pressable
                style={styles.directionsButton}
                onPress={() =>
                  openDirections(selection.landmark.lat, selection.landmark.lng)
                }
              >
                <Ionicons name="navigate" size={18} color={colors.background} />
                <Text style={styles.directionsText}>{t('map.getDirections')}</Text>
              </Pressable>
              <Pressable
                style={styles.reviewButton}
                onPress={() => handleToggleVisited(selection.landmark.id)}
              >
                <Ionicons
                  name={
                    visitedLandmarkIds.has(selection.landmark.id)
                      ? 'arrow-undo'
                      : 'checkmark-circle'
                  }
                  size={18}
                  color={
                    visitedLandmarkIds.has(selection.landmark.id) ? colors.textMuted : colors.safe
                  }
                />
                <Text style={styles.reviewButtonText}>
                  {visitedLandmarkIds.has(selection.landmark.id)
                    ? t('landmarks.markNotVisited')
                    : t('landmarks.markVisited')}
                </Text>
              </Pressable>
              <Pressable
                style={styles.reviewButton}
                onPress={() =>
                  !premium
                    ? showPaywall('contribute')
                    : setReviewTarget({
                    id: selection.landmark.id,
                    type: 'landmark',
                    name: localizedField(selection.landmark, 'name', language),
                  })
                }
              >
                <Ionicons name="star" size={18} color={colors.text} />
                <Text style={styles.reviewButtonText}>{t('review.rateButton')}</Text>
              </Pressable>
            </>
          )}

          {selection?.type === 'place' && (
            <>
              <Text style={styles.sheetTitle}>{selection.place.name}</Text>
              <Text style={styles.landmarkDescription}>
                {selection.place.address}
                {selection.place.open_24h ? ` · ${t('map.open24h')}` : ''}
              </Text>
              <PlacePhotoStrip photos={placePhotos[photoKey('place', selection.place.id)]} />
              <Pressable
                style={styles.directionsButton}
                onPress={() =>
                  openDirections(selection.place.lat, selection.place.lng)
                }
              >
                <Ionicons name="navigate" size={18} color={colors.background} />
                <Text style={styles.directionsText}>{t('map.getDirections')}</Text>
              </Pressable>
              <Pressable
                style={styles.reviewButton}
                onPress={() =>
                  !premium
                    ? showPaywall('contribute')
                    : setReviewTarget({
                    id: selection.place.id,
                    type: 'place',
                    name: selection.place.name,
                  })
                }
              >
                <Ionicons name="star" size={18} color={colors.text} />
                <Text style={styles.reviewButtonText}>{t('review.rateButton')}</Text>
              </Pressable>
            </>
          )}

          {selection?.type === 'submission' && (
            <>
              <Image
                source={{ uri: selection.submission.photoUrl }}
                style={styles.submissionPhoto}
                contentFit="cover"
              />
              <View style={styles.submissionCategoryRow}>
                <Ionicons
                  name={SUBMISSION_CATEGORY_ICONS[selection.submission.category]}
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.submissionCategoryText}>
                  {t(SUBMISSION_CATEGORY_LABEL_KEYS[selection.submission.category])}
                </Text>
              </View>
              {selection.submission.approved ? (
                <>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons
                        key={n}
                        name={
                          n <= (selection.submission.rating ?? 0) ? 'star' : 'star-outline'
                        }
                        size={18}
                        color="#f59e0b"
                      />
                    ))}
                  </View>
                  {selection.submission.comment && (
                    <Text style={styles.landmarkDescription}>{selection.submission.comment}</Text>
                  )}
                </>
              ) : (
                <Text style={styles.pendingNote}>{t('newPlace.pending')}</Text>
              )}
              <Pressable
                style={styles.directionsButton}
                onPress={() =>
                  openDirections(selection.submission.lat, selection.submission.lng)
                }
              >
                <Ionicons name="navigate" size={18} color={colors.background} />
                <Text style={styles.directionsText}>{t('map.getDirections')}</Text>
              </Pressable>
            </>
          )}

          {selection?.type === 'poi' && (
            <>
              <Text style={styles.sheetTitle}>{selection.poi.name}</Text>
              {poiZone && poiZoneTier && poiZoneScore !== null ? (
                <>
                  <View style={styles.scoreRow}>
                    <View
                      style={[styles.levelDot, { backgroundColor: TIER_COLORS[poiZoneTier] }]}
                    />
                    <Text style={styles.sheetScore}>
                      {localizedField(poiZone, 'name', language)} · {poiZoneScore}/100 ·{' '}
                      {t(TIER_LABEL_KEYS[poiZoneTier])}
                    </Text>
                  </View>
                  {localizedList(poiZone, 'tips', language)
                    .slice(0, 2)
                    .map((tip) => (
                      <Text key={tip} style={styles.tip}>
                        • {tip}
                      </Text>
                    ))}
                </>
              ) : (
                <Text style={styles.landmarkDescription}>{t('map.poiNoZone')}</Text>
              )}
              <Pressable
                style={styles.directionsButton}
                onPress={() =>
                  openDirections(selection.poi.lat, selection.poi.lng, selection.poi.placeId)
                }
              >
                <Ionicons name="navigate" size={18} color={colors.background} />
                <Text style={styles.directionsText}>{t('map.getDirections')}</Text>
              </Pressable>
              <Pressable
                style={styles.reviewButton}
                onPress={() =>
                  openInGoogleMaps(selection.poi.placeId, selection.poi.lat, selection.poi.lng)
                }
              >
                <Ionicons name="open-outline" size={18} color={colors.text} />
                <Text style={styles.reviewButtonText}>{t('map.openInGoogleMaps')}</Text>
              </Pressable>
            </>
          )}

        </BottomSheetScrollView>
      </BottomSheet>

      {newPlacePin && (
        <NewPlaceModal
          visible
          lat={newPlacePin.lat}
          lng={newPlacePin.lng}
          onClose={() => setNewPlacePin(null)}
          onSubmitted={() => {
            setNewPlacePin(null);
            refreshSubmittedPlaces();
          }}
        />
      )}

      {reviewTarget && (
        <ReviewModal
          visible
          placeId={reviewTarget.id}
          placeType={reviewTarget.type}
          placeName={reviewTarget.name}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
  toggle: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  toggleButtonActive: {
    backgroundColor: colors.safe,
  },
  toggleText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: colors.background,
  },
  toastStack: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
    zIndex: 15,
  },
  infoToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  infoToastText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  layersButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layersPanel: {
    position: 'absolute',
    top: 104,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    minWidth: 190,
  },
  legendButton: {
    position: 'absolute',
    top: 56,
    right: 66,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same top-right row as layers/legend (right:16/66) — continuing the row
  // at right:116 so it's in the same immediately-visible cluster the user
  // already finds easily, instead of bottom-right where it turned out to be
  // easy to miss (likely crowded by the tab bar).
  // Bottom-right, directly below the SOS button (right:16, bottom:92,
  // 58x58) — a 26pt gap above this button's top edge. Blue to match the
  // native "you are here" dot's color, so it reads as "the location control".
  locateButtonBottom: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  legendPanel: {
    position: 'absolute',
    top: 104,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    minWidth: 230,
  },
  legendTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  legendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  legendTextBlock: {
    flex: 1,
  },
  legendLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  legendRange: {
    color: colors.textMuted,
    fontSize: 12,
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  layerLabel: {
    color: colors.text,
    fontSize: 14,
    marginRight: 12,
  },
  layerDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
  zoneDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.white,
  },
  pinContainer: {
    alignItems: 'center',
  },
  pinBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: LANDMARK_COLOR,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submissionBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#a855f7',
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submissionBubblePending: {
    backgroundColor: colors.textMuted,
  },
  pinArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: LANDMARK_COLOR,
    marginTop: -1,
  },
  sheetBackground: {
    backgroundColor: colors.card,
  },
  sheetHandle: {
    backgroundColor: colors.border,
  },
  sheetContent: {
    flex: 1,
  },
  sheetContentContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  sheetScore: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  tip: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 6,
    lineHeight: 20,
  },
  feedbackRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  feedbackButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  feedbackButtonSafe: {
    backgroundColor: colors.safe,
  },
  feedbackButtonUnsafe: {
    backgroundColor: colors.risk,
  },
  feedbackButtonText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackThanks: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
  },
  landmarkDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.safe,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  directionsText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
    marginTop: 10,
  },
  reviewButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  photoStrip: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  placePhoto: {
    flex: 1,
    height: 110,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  submissionPhoto: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.background,
    marginBottom: 12,
  },
  submissionCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  submissionCategoryText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  stars: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  pendingNote: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 14,
  },
});
