import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MapView, { Circle, Marker } from 'react-native-maps';
import type { LongPressEvent } from 'react-native-maps';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
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
import { fetchPlaceSubmissions } from '../lib/placeSubmissions';
import type { PlaceSubmission, PlaceSubmissionCategory } from '../lib/placeSubmissions';
import { currentTimeOfDay, isEveningOrLater } from '../lib/guardianContext';
import { presentEveningZoneNotification } from '../lib/notifications';
import { startEveningZoneLiveActivity } from '../lib/liveActivity';

type LandmarkCategory =
  | 'monument'
  | 'fortress'
  | 'church'
  | 'landmark'
  | 'square'
  | 'theatre'
  | 'market'
  | 'viewpoint'
  | 'park';

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
type Selection =
  | { type: 'zone'; zone: Zone }
  | { type: 'landmark'; landmark: Landmark }
  | { type: 'place'; place: SafePlace }
  | { type: 'submission'; submission: PlaceSubmission };

const landmarks = landmarksData as Landmark[];

// Fire the evening zone nudge (notification + Live Activity) at most once per
// app session, even if the Map tab remounts — otherwise every tab switch after
// 19:00 would re-notify.
let eveningNudgeSent = false;

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

function withOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}

function openDirections(lat: number, lng: number, label: string) {
  // Requires internet — silently fails instead of throwing when offline.
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(
    label,
  )}`;
  Linking.openURL(url).catch(() => {});
}

export default function MapScreen() {
  const { t, language } = useLanguage();
  const zones = useRemoteData(zonesData as Zone[], fetchZones);
  const safePlaces = useRemoteData(safePlacesData as SafePlace[], fetchSafePlaces);
  // Tourist-submitted places (Phase 4.5c) — no local/offline fallback exists
  // for this dynamic, user-generated layer, so it starts empty and only
  // appears if/when Supabase is reachable. Managed directly (not via
  // useRemoteData, which only fetches once per mount) so a successful new
  // submission can trigger an immediate re-fetch to show the new pin.
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

  useEffect(() => {
    if (!isEveningOrLater()) return;
    if (!eveningNudgeSent) {
      eveningNudgeSent = true;
      presentEveningZoneNotification(t('map.eveningNotifTitle'), t('map.eveningNotifBody'));
      startEveningZoneLiveActivity(t('map.eveningNotifTitle'), t('map.eveningZonesOn'));
    }
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

  const handleMapLongPress = useCallback((e: LongPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setNewPlacePin({ lat: latitude, lng: longitude });
  }, []);

  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['38%'], []);

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

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={TBILISI_REGION}
        onLongPress={handleMapLongPress}
      >
        {showZones &&
          circles.map(({ zone, color }) => (
            <Circle
              key={zone.id}
              center={{ latitude: zone.lat, longitude: zone.lng }}
              radius={800}
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
              title={localizedField(zone, 'name', language)}
              tracksViewChanges={false}
              onPress={() => handleZonePress(zone)}
            >
              <View style={[styles.zoneDot, { backgroundColor: color }]} />
            </Marker>
          ))}

        {showLandmarks &&
          landmarks.map((landmark) => (
            <Marker
              key={landmark.id}
              coordinate={{ latitude: landmark.lat, longitude: landmark.lng }}
              title={localizedField(landmark, 'name', language)}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
              onPress={() => handleLandmarkPress(landmark)}
            >
              <View style={styles.pinContainer}>
                <View style={styles.pinBubble}>
                  <Ionicons
                    name={CATEGORY_ICONS[landmark.category]}
                    size={13}
                    color={colors.background}
                  />
                </View>
                <View style={styles.pinArrow} />
              </View>
            </Marker>
          ))}

        {safePlaces
          .filter((place) => placeVisibility[place.type])
          .map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.lat, longitude: place.lng }}
              title={place.name}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
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
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
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
            anchor={{ x: 0.5, y: 1 }}
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

      {(showEveningToast || showAutoNightToast) && (
        <View style={styles.toastStack} pointerEvents="box-none">
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
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetView style={styles.sheetContent}>
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
              <Pressable
                style={styles.directionsButton}
                onPress={() =>
                  openDirections(
                    selection.landmark.lat,
                    selection.landmark.lng,
                    localizedField(selection.landmark, 'name', language),
                  )
                }
              >
                <Ionicons name="navigate" size={18} color={colors.background} />
                <Text style={styles.directionsText}>{t('map.getDirections')}</Text>
              </Pressable>
              <Pressable
                style={styles.reviewButton}
                onPress={() =>
                  setReviewTarget({
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
              <Pressable
                style={styles.directionsButton}
                onPress={() =>
                  openDirections(selection.place.lat, selection.place.lng, selection.place.name)
                }
              >
                <Ionicons name="navigate" size={18} color={colors.background} />
                <Text style={styles.directionsText}>{t('map.getDirections')}</Text>
              </Pressable>
              <Pressable
                style={styles.reviewButton}
                onPress={() =>
                  setReviewTarget({
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
                  openDirections(
                    selection.submission.lat,
                    selection.submission.lng,
                    t('newPlace.title'),
                  )
                }
              >
                <Ionicons name="navigate" size={18} color={colors.background} />
                <Text style={styles.directionsText}>{t('map.getDirections')}</Text>
              </Pressable>
            </>
          )}
        </BottomSheetView>
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
    paddingHorizontal: 20,
    paddingTop: 8,
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
