import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LongPressEvent, MarkerDragStartEndEvent, PoiClickEvent } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { MAP_DARK_STYLE } from '../theme/mapDarkStyle';
import landmarksData from '../data/landmarks.json';
import safePlacesData from '../data/safe_places.json';
import { useLanguage } from '../i18n/LanguageContext';
import { localizedField } from '../lib/localizeData';
import { fetchSafePlaces } from '../lib/remoteData';
import type { SafePlace, SafePlaceType } from '../lib/remoteData';
import { useRiskZones } from '../lib/useRiskZones';
import { findRiskZoneAt, riskZoneComment, updateRiskZone } from '../lib/riskZones';
import type { RiskLevel, RiskZone } from '../lib/riskZones';
import RiskZoneModal from '../components/admin/RiskZoneModal';
import type { RiskZoneTarget } from '../components/admin/RiskZoneModal';
import { useRemoteData } from '../lib/useRemoteData';
import { submitZoneFeedback } from '../lib/feedback';
import type { ZoneVote } from '../lib/feedback';
import ReviewModal from '../components/ReviewModal';
import type { PlaceReviewType } from '../lib/placeReviews';
import NewPlaceModal from '../components/NewPlaceModal';
import AdminMapEditModal from '../components/admin/AdminMapEditModal';
import type { AdminEditTarget } from '../components/admin/AdminMapEditModal';
import { useAuth } from '../auth/AuthContext';
import { isAdminEmail } from '../lib/admin';
import LandmarkMarker from '../components/LandmarkMarker';
import { fetchPlaceSubmissions } from '../lib/placeSubmissions';
import { fetchPlacePhotos, photoKey } from '../lib/placePhotos';
import { usePremium } from '../premium/PremiumContext';
import type { PlacePhoto } from '../lib/placePhotos';
import type { PlaceSubmission, PlaceSubmissionCategory, PlaceSubmissionKind } from '../lib/placeSubmissions';
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
import { initLandmarkGeofencing, refreshLandmarkGeofences, syncCommunityAlertGeofences } from '../lib/landmarkGeofencing';
import { LISTING_CATEGORIES, fetchPublishedPartnerListings } from '../lib/rentals';
import type { ListingCategory, PartnerListing } from '../lib/rentals';

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
  | { type: 'zone'; zone: RiskZone }
  | { type: 'landmark'; landmark: Landmark }
  | { type: 'place'; place: SafePlace }
  | { type: 'submission'; submission: PlaceSubmission }
  | { type: 'partnerListing'; listing: PartnerListing }
  | { type: 'poi'; poi: Poi };

const landmarks = landmarksData as Landmark[];

// Only two things are ever drawn: an orange (caution) or red (high-risk)
// circle the admin marked. Everything else on the map is unmarked, which the
// legend explains as "no known warning" — never as "safe".
const RISK_LEVELS: RiskLevel[] = ['orange', 'red'];
const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  orange: colors.warning,
  red: colors.risk,
};
const RISK_LEVEL_LABEL_KEYS: Record<RiskLevel, string> = {
  orange: 'map.riskZoneOrange',
  red: 'map.riskZoneRed',
};

// "Active until 15.09 18:30" — short enough for one line in the sheet.
function formatExpiry(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  auto: 'car-sport',
  taxi: 'car',
  shop: 'storefront',
  restaurant: 'restaurant',
  bar: 'beer',
  exchange: 'cash',
  street: 'walk',
  school: 'school',
  atm: 'cash',
  pharmacy: 'medkit',
  other: 'location',
};

const SUBMISSION_CATEGORY_LABEL_KEYS: Record<PlaceSubmissionCategory, string> = {
  auto: 'newPlace.categoryAuto',
  taxi: 'newPlace.categoryTaxi',
  shop: 'newPlace.categoryShop',
  restaurant: 'newPlace.categoryRestaurant',
  bar: 'newPlace.categoryBar',
  exchange: 'newPlace.categoryExchange',
  street: 'newPlace.categoryStreet',
  school: 'newPlace.categorySchool',
  atm: 'newPlace.categoryAtm',
  pharmacy: 'newPlace.categoryPharmacy',
  other: 'newPlace.categoryOther',
};

const SUBMISSION_KIND_COLORS: Record<PlaceSubmissionKind, string> = {
  positive: colors.safe,
  alert: colors.risk,
};

const PARTNER_CATEGORY_ICONS: Record<ListingCategory, keyof typeof Ionicons.glyphMap> = {
  car_rental: 'car-sport', bar: 'beer', restaurant: 'restaurant', club: 'musical-notes',
  currency_exchange: 'cash', airport_transfer: 'airplane', hotel: 'bed', tour: 'trail-sign',
  other: 'ellipsis-horizontal-circle',
};
const PARTNER_CATEGORY_COLORS: Record<ListingCategory, string> = {
  car_rental: '#0ea5e9', bar: '#d946ef', restaurant: '#f97316', club: '#ec4899',
  currency_exchange: '#22c55e', airport_transfer: '#6366f1', hotel: '#a855f7', tour: '#eab308',
  other: '#64748b',
};

// Partner categories the layers panel lets the tourist toggle. Tours and
// airport transfers are deliberately left out (always shown) — they are
// rare pins and not something you switch off while walking around.
const PARTNER_LAYER_CATEGORIES: ListingCategory[] = [
  'car_rental', 'bar', 'restaurant', 'club', 'currency_exchange', 'hotel', 'other',
];

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
  partnerListing: 5,
  newPin: 6,
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

export default function MapScreen() {
  const { t, language } = useLanguage();
  const { premium, freeRemaining, showPaywall } = usePremium();
  const { session } = useAuth();
  // Display gate only — every write below is re-checked by RLS (see lib/admin.ts).
  const isAdmin = isAdminEmail(session?.user?.email);
  // Bumped after an admin edits a zone or safe place, so the map re-fetches
  // reference data that would otherwise only load once per mount.
  const [referenceReload, setReferenceReload] = useState(0);
  const riskZones = useRiskZones(referenceReload);
  const safePlaces = useRemoteData(safePlacesData as SafePlace[], fetchSafePlaces, referenceReload);
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
  const refreshPlacePhotos = useCallback(() => {
    fetchPlacePhotos()
      .then(setPlacePhotos)
      .catch(() => {
        // Offline — the sheets just show no photos.
      });
  }, []);
  useEffect(() => {
    refreshPlacePhotos();
  }, [refreshPlacePhotos]);

  const [submittedPlaces, setSubmittedPlaces] = useState<PlaceSubmission[]>([]);
  const [partnerListings, setPartnerListings] = useState<PartnerListing[]>([]);
  const refreshPartnerListings = useCallback(() => {
    fetchPublishedPartnerListings().then(setPartnerListings).catch(() => setPartnerListings([]));
  }, []);
  const refreshSubmittedPlaces = useCallback(() => {
    fetchPlaceSubmissions()
      .then((rows) => {
        setSubmittedPlaces(rows);
        return syncCommunityAlertGeofences(
          rows
            .filter((row) => row.kind === 'alert')
            .map(({ id, lat, lng, category }) => ({ id, lat, lng, category })),
        );
      })
      .then(() => {
        if (!locationGranted) return;
        return Location.getCurrentPositionAsync({})
          .then((position) => refreshLandmarkGeofences(position.coords.latitude, position.coords.longitude))
          .catch(() => {});
      })
      .catch(() => {
        // Offline/unreachable — keep showing whatever was last loaded.
      });
  }, [locationGranted]);
  useEffect(() => {
    refreshSubmittedPlaces();
  }, [refreshSubmittedPlaces]);
  // Re-check community reports whenever the visitor comes back to the map.
  // This makes an admin-approved red warning visible without requiring an
  // app restart, and updates the proximity-warning regions at the same time.
  useFocusEffect(refreshSubmittedPlaces);
  useFocusEffect(refreshPartnerListings);
  // Day/Night switches the basemap style (dark tiles at night — see
  // mapDarkStyle.ts); risk zones themselves don't depend on it, they show
  // whenever they are active. Defaults to Night automatically if it's
  // currently night (22:00-05:59, same threshold as guardianContext.ts) — the
  // toggle below still lets the user override it manually either way.
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
  // Risk zones are warnings, so they are on by default at any hour — the
  // layers panel below still lets the user hide them.
  const [showZones, setShowZones] = useState(true);
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
  const [partnerVisibility, setPartnerVisibility] = useState<Record<ListingCategory, boolean>>(
    () => Object.fromEntries(LISTING_CATEGORIES.map((c) => [c, true])) as Record<ListingCategory, boolean>,
  );
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
  const [adminTarget, setAdminTarget] = useState<AdminEditTarget | null>(null);
  const [riskZoneTarget, setRiskZoneTarget] = useState<RiskZoneTarget | null>(null);

  const handleMapLongPress = useCallback(
    (e: LongPressEvent) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      // The same gesture creates a risk zone for the administrator, so they
      // get to choose; tourists go straight to the report form. The submit
      // action checks the server-side free-report allowance and opens Premium
      // only when the visitor has already used it.
      if (!isAdmin) {
        setNewPlacePin({ lat: latitude, lng: longitude });
        return;
      }
      Alert.alert(t('riskZone.longPressTitle'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('riskZone.longPressReport'), onPress: () => setNewPlacePin({ lat: latitude, lng: longitude }) },
        { text: t('riskZone.longPressZone'), onPress: () => setRiskZoneTarget({ mode: 'create', lat: latitude, lng: longitude }) },
      ]);
    },
    [isAdmin, t],
  );

  // Admin drag of a zone's centre marker — the circle follows on save.
  const handleZoneDragEnd = useCallback(
    (zone: RiskZone, e: MarkerDragStartEndEvent) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      updateRiskZone(zone.id, { lat: latitude, lng: longitude }).then((ok) => {
        if (ok) setReferenceReload((token) => token + 1);
        else Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
      });
    },
    [t],
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

  // A newly fetched or edited zone should be geofenced right away, not on
  // the next 10-minute tick — a warning is worth little if it arrives late.
  useEffect(() => {
    if (!locationGranted) return;
    Location.getCurrentPositionAsync({})
      .then((position) => refreshLandmarkGeofences(position.coords.latitude, position.coords.longitude))
      .catch(() => {});
  }, [riskZones, locationGranted]);

  const handleZonePress = useCallback((zone: RiskZone) => {
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
  const togglePartnerCategory = useCallback((category: ListingCategory, value: boolean) => {
    setPartnerVisibility((prev) => ({ ...prev, [category]: value }));
  }, []);

  // Safety reading for a tapped basemap POI: the risk zone it sits in, or
  // null — the sheet then says "no active warnings" rather than guessing.
  const poiZone = useMemo(
    () =>
      selection?.type === 'poi'
        ? findRiskZoneAt(selection.poi.lat, selection.poi.lng, riskZones)
        : null,
    [selection, riskZones],
  );

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
        customMapStyle={mode === 'night' ? MAP_DARK_STYLE : undefined}
        initialRegion={TBILISI_REGION}
        onLongPress={handleMapLongPress}
        onPoiClick={handlePoiClick}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
      >
        {showZones &&
          riskZones.map((zone) => (
            <Circle
              key={zone.id}
              center={{ latitude: zone.lat, longitude: zone.lng }}
              radius={zone.radiusM}
              fillColor={withOpacity(RISK_LEVEL_COLORS[zone.level], 0.25)}
              strokeColor={RISK_LEVEL_COLORS[zone.level]}
              strokeWidth={2}
            />
          ))}

        {showZones &&
          riskZones.map((zone) => (
            <Marker
              key={`${zone.id}-marker`}
              coordinate={{ latitude: zone.lat, longitude: zone.lng }}
              tracksViewChanges={false}
              zIndex={Z_INDEX.zone}
              draggable={isAdmin}
              onDragEnd={(e) => handleZoneDragEnd(zone, e)}
              onPress={() => handleZonePress(zone)}
            >
              <View style={[styles.zoneDot, { backgroundColor: RISK_LEVEL_COLORS[zone.level] }]}>
                <Ionicons name="warning" size={10} color={colors.white} />
              </View>
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
              <View style={[styles.submissionBubble, submission.kind === 'alert' && styles.alertSubmissionBubble, { backgroundColor: SUBMISSION_KIND_COLORS[submission.kind] }]}>
                <Ionicons
                  name={submission.kind === 'positive' ? 'thumbs-up' : 'warning'}
                  size={13}
                  color={colors.white}
                />
              </View>
              <View
                style={[
                  styles.pinArrow,
                  {
                    borderTopColor: SUBMISSION_KIND_COLORS[submission.kind],
                  },
                ]}
              />
            </View>
          </Marker>
        ))}

        {partnerListings
          .filter((listing) => partnerVisibility[listing.category])
          .map((listing) => (
          <Marker
            key={`partner-${listing.id}`}
            coordinate={{ latitude: listing.latitude!, longitude: listing.longitude! }}
            anchor={PIN_ANCHOR}
            tracksViewChanges={false}
            zIndex={Z_INDEX.partnerListing}
            onPress={() => {
              setSelection({ type: 'partnerListing', listing });
              bottomSheetRef.current?.expand();
            }}
          >
            <View style={styles.pinContainer}>
              <View style={[styles.partnerBubble, { backgroundColor: PARTNER_CATEGORY_COLORS[listing.category] }]}>
                <Ionicons name={PARTNER_CATEGORY_ICONS[listing.category]} size={14} color={colors.white} />
              </View>
              <View style={[styles.pinArrow, { borderTopColor: PARTNER_CATEGORY_COLORS[listing.category] }]} />
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
        <ScrollView
          style={styles.layersPanel}
          contentContainerStyle={styles.layersPanelContent}
          showsVerticalScrollIndicator={false}
        >
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
          <View style={styles.layerDivider} />
          {PARTNER_LAYER_CATEGORIES.map((category) => (
            <View key={category} style={styles.layerRow}>
              <Text style={styles.layerLabel}>{t(`partnerListings.category.${category}`)}</Text>
              <Switch
                value={partnerVisibility[category]}
                onValueChange={(value) => togglePartnerCategory(category, value)}
                trackColor={{ false: colors.border, true: colors.safe }}
              />
            </View>
          ))}
        </ScrollView>
      )}

      {legendOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setLegendOpen(false)} />
      )}

      {legendOpen && (
        <View style={styles.legendPanel}>
          <Text style={styles.legendTitle}>{t('map.legendTitle')}</Text>
          {RISK_LEVELS.map((level) => (
            <View key={level} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: RISK_LEVEL_COLORS[level] }]} />
              <View style={styles.legendTextBlock}>
                <Text style={styles.legendLabel}>{t(RISK_LEVEL_LABEL_KEYS[level])}</Text>
                <Text style={styles.legendRange}>{t(`map.legendHint_${level}`)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotNone]} />
            <View style={styles.legendTextBlock}>
              <Text style={styles.legendLabel}>{t('map.legendNone')}</Text>
              <Text style={styles.legendRange}>{t('map.legendHint_none')}</Text>
            </View>
          </View>
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
          {isAdmin && selection && selection.type !== 'poi' && (
            <Pressable
              style={styles.adminEditButton}
              onPress={() =>
                selection.type === 'zone'
                  ? setRiskZoneTarget({ mode: 'edit', zone: selection.zone })
                  : setAdminTarget(selection)
              }
            >
              <Ionicons name="create-outline" size={16} color={colors.background} />
              <Text style={styles.adminEditText}>{t('admin.editOnMap')}</Text>
            </Pressable>
          )}
          {selection?.type === 'zone' && (
            <>
              <View style={styles.scoreRow}>
                <View
                  style={[styles.levelDot, { backgroundColor: RISK_LEVEL_COLORS[selection.zone.level] }]}
                />
                <Text style={styles.sheetTitle}>{t(RISK_LEVEL_LABEL_KEYS[selection.zone.level])}</Text>
              </View>
              <Text style={styles.landmarkDescription}>{riskZoneComment(selection.zone, language)}</Text>
              <Text style={styles.sheetScore}>
                {t('map.activeUntil').replace('{time}', formatExpiry(selection.zone.expiresAt))}
              </Text>
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
                  name={selection.submission.kind === 'positive' ? 'thumbs-up' : 'warning'}
                  size={14}
                  color={SUBMISSION_KIND_COLORS[selection.submission.kind]}
                />
                <Text style={styles.submissionCategoryText}>
                  {t(selection.submission.kind === 'positive' ? 'newPlace.positiveType' : 'newPlace.alertType')} · {t(SUBMISSION_CATEGORY_LABEL_KEYS[selection.submission.category])}
                </Text>
              </View>
              {selection.submission.comment && (
                <Text style={styles.landmarkDescription}>{selection.submission.comment}</Text>
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

          {selection?.type === 'partnerListing' && (
            <>
              <View style={styles.submissionCategoryRow}>
                <Ionicons name={PARTNER_CATEGORY_ICONS[selection.listing.category]} size={16} color={PARTNER_CATEGORY_COLORS[selection.listing.category]} />
                <Text style={styles.submissionCategoryText}>{t(`partnerListings.category.${selection.listing.category}`)}</Text>
              </View>
              <Text style={styles.sheetTitle}>{selection.listing.title}</Text>
              <Text style={styles.landmarkDescription}>
                {[selection.listing.companyName, selection.listing.address, selection.listing.city].filter(Boolean).join(' · ')}
              </Text>
              {selection.listing.description ? <Text style={styles.landmarkDescription}>{selection.listing.description}</Text> : null}
              {selection.listing.workingHours ? <Text style={styles.tip}>{selection.listing.workingHours}</Text> : null}
              {selection.listing.priceDescription ? <Text style={styles.tip}>{selection.listing.priceDescription}</Text> : null}
              <Pressable style={styles.directionsButton} onPress={() => openDirections(selection.listing.latitude!, selection.listing.longitude!)}>
                <Ionicons name="navigate" size={18} color={colors.background} />
                <Text style={styles.directionsText}>{t('map.getDirections')}</Text>
              </Pressable>
              {selection.listing.phone ? <Pressable style={styles.reviewButton} onPress={() => Linking.openURL(`tel:${selection.listing.phone!.replace(/\s+/g,'')}`).catch(()=>{})}>
                <Ionicons name="call" size={18} color={colors.text} />
                <Text style={styles.reviewButtonText}>{t('common.call')}</Text>
              </Pressable> : null}
            </>
          )}

          {selection?.type === 'poi' && (
            <>
              <Text style={styles.sheetTitle}>{selection.poi.name}</Text>
              {poiZone ? (
                <>
                  <View style={styles.scoreRow}>
                    <View
                      style={[styles.levelDot, { backgroundColor: RISK_LEVEL_COLORS[poiZone.level] }]}
                    />
                    <Text style={styles.sheetScore}>{t(RISK_LEVEL_LABEL_KEYS[poiZone.level])}</Text>
                  </View>
                  <Text style={styles.tip}>{riskZoneComment(poiZone, language)}</Text>
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
          onLimitReached={() => {
            setNewPlacePin(null);
            showPaywall('contribute');
          }}
        />
      )}

      <RiskZoneModal
        target={riskZoneTarget}
        onClose={() => setRiskZoneTarget(null)}
        onSaved={() => {
          setRiskZoneTarget(null);
          bottomSheetRef.current?.close();
          setSelection(null);
          setReferenceReload((token) => token + 1);
        }}
      />

      <AdminMapEditModal
        target={adminTarget}
        onClose={() => setAdminTarget(null)}
        onSaved={() => {
          // Whatever was edited, the pin under the sheet no longer matches the
          // database — refresh every layer and drop the selection.
          setAdminTarget(null);
          bottomSheetRef.current?.close();
          setSelection(null);
          refreshSubmittedPlaces();
          refreshPartnerListings();
          setReferenceReload((token) => token + 1);
        }}
        onPhotosChanged={refreshPlacePhotos}
      />

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
    minWidth: 190,
    // 16 toggle rows no longer fit on a phone above the bottom sheet /
    // tab bar, so the panel scrolls past this height.
    maxHeight: 440,
  },
  layersPanelContent: {
    padding: 12,
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
  legendDotNone: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.textMuted,
  },
  zoneDot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.white,
  },
  pinContainer: {
    alignItems: 'center',
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
  // The warning glyph itself is the recognizable triangle/exclamation mark;
  // this stronger red plate keeps alert pins distinct from green community
  // recommendations at a glance.
  alertSubmissionBubble: {
    width: 32,
    height: 32,
    borderRadius: 7,
    shadowColor: colors.risk,
    shadowOpacity: 0.32,
    shadowRadius: 4,
    elevation: 3,
  },
  partnerBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
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
  adminEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.warning,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  adminEditText: { color: colors.background, fontSize: 13, fontWeight: '700' },
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
});
