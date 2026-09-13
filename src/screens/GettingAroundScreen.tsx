import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import taxiGuide from '../data/taxi_guide.json';
import rentalsData from '../data/rentals.json';
import { useLanguage } from '../i18n/LanguageContext';
import { localizedField } from '../lib/localizeData';
import { BODY_TYPES, fetchRentalCars } from '../lib/rentals';
import CitySelect from '../components/CitySelect';
import { getSelectedRentalCity, setSelectedRentalCity } from '../lib/storage';
import type { BodyType, RentalCar } from '../lib/rentals';
import RentalCarCard from '../components/RentalCarCard';

// App-based scooter sharing (Scroll, JET, Yandex Go) — opened, not phoned.
// Car rentals are no longer bundled data: they come from approved partners
// (see src/lib/rentals.ts).
type ScooterApp = {
  id: string;
  name_en: string;
  name_ka: string;
  name_ru: string;
  cities_en: string;
  cities_ka: string;
  cities_ru: string;
  note_en: string;
  note_ka: string;
  note_ru: string;
  // False keeps the card visible but dimmed and unopenable — a service that
  // has paused is more useful shown as paused than silently removed.
  available: boolean;
};

const scooterApps = rentalsData.scooter_apps as ScooterApp[];

type TaxiApp = {
  id: string;
  name_en: string;
  name_ka: string;
  name_ru: string;
  recommended: boolean;
  description_en: string;
  description_ka: string;
  description_ru: string;
  how_to_use_en: string;
  how_to_use_ka: string;
  how_to_use_ru: string;
};

type FareEstimate = {
  route_en: string;
  route_ka: string;
  route_ru: string;
  low: number;
  high: number;
};

const apps = taxiGuide.apps as TaxiApp[];
const fares = taxiGuide.estimated_fares_gel as FareEstimate[];

// Only Bolt and Yandex have declared URL schemes (see app.json's
// LSApplicationQueriesSchemes). The rest open on the web, which on iOS still
// hands off to the installed app when it claims the domain.
const APP_URLS: Record<string, { scheme?: string; web: string }> = {
  bolt: { scheme: 'bolt://', web: 'https://bolt.eu/en/' },
  yandex_go: { scheme: 'yandextaxi://', web: 'https://go.yandex.com/' },
  scroll: { web: 'https://scroll.eco/' },
  jet: { web: 'https://jetsharing.ge/' },
};

async function openTaxiApp(appId: string) {
  const urls = APP_URLS[appId];
  if (!urls) return;

  // iOS throws if the scheme isn't declared in LSApplicationQueriesSchemes
  // (see app.json ios.infoPlist) instead of just returning false — always
  // fall back to the web URL on any failure so the button never dead-ends.
  if (!urls.scheme) {
    await Linking.openURL(urls.web).catch(() => {});
    return;
  }
  try {
    const canOpen = await Linking.canOpenURL(urls.scheme);
    await Linking.openURL(canOpen ? urls.scheme : urls.web);
  } catch {
    await Linking.openURL(urls.web);
  }
}

// The two ride-hailing apps a tourist actually needs, shown as quick cards.
const QUICK_APP_IDS = ['bolt', 'yandex_go'];

const BODY_TYPE_ICONS: Record<BodyType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  coupe: 'car-sports',
  sedan: 'car',
  suv: 'car-lifted-pickup',
};

export default function GettingAroundScreen() {
  const { t, language } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [cars, setCars] = useState<RentalCar[]>([]);
  const [city, setCity] = useState<string | null>(null);
  const [bodyType, setBodyType] = useState<BodyType | null>(null);
  const [query, setQuery] = useState('');

  // Body type and text search are applied on top of the city filter, locally:
  // the list is already small once a city is chosen.
  const visibleCars = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return cars.filter((car) => {
      if (bodyType && car.bodyType !== bodyType) return false;
      if (!needle) return true;
      return `${car.make} ${car.model} ${car.companyName}`.toLocaleLowerCase().includes(needle);
    });
  }, [cars, bodyType, query]);

  const quickApps = apps.filter((app) => QUICK_APP_IDS.includes(app.id));

  // The tourist picks the city from the fixed list (remembered between
  // visits) instead of the app guessing it from GPS — the geocoder's localised
  // spelling never reliably matched what partners typed. "All cities" (null)
  // drops the filter.
  const loadCars = useCallback(async (selectedCity: string | null) => {
    try {
      setCars(await fetchRentalCars(selectedCity ?? undefined));
    } catch {
      setCars([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSelectedRentalCity().then((saved) => {
      if (cancelled) return;
      setCity(saved);
      void loadCars(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [loadCars]);

  const changeCity = useCallback((next: string | null) => {
    setCity(next);
    void setSelectedRentalCity(next);
    void loadCars(next);
  }, [loadCars]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadCars(city).finally(() => setRefreshing(false));
  }, [loadCars, city]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.safe} />
      }
    >
      <Text style={styles.sectionTitle}>{t('gettingAround.title')}</Text>

      {/* Bolt / Yandex Go are the two most-used ride apps — always pinned as
          a quick side-by-side row at the top so they're the first thing
          a tourist taps, before anything else on this screen. */}
      <View style={styles.quickRow}>
        {quickApps.map((app) => (
          <View key={app.id} style={styles.quickCard}>
            <Ionicons name="car" size={22} color={colors.text} />
            <Text style={styles.quickCardTitle}>{localizedField(app, 'name', language)}</Text>
            {app.recommended && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>{t('gettingAround.recommended')}</Text>
              </View>
            )}
            <Pressable
              style={[styles.openButton, styles.quickOpenButton]}
              onPress={() => openTaxiApp(app.id)}
            >
              <Text style={styles.openButtonText}>{t('gettingAround.open')}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {/* Scooter apps sit directly under the ride apps as a second, tighter
          row — three across, so they read as one continuous block of "apps
          you can open" rather than a separate section further down. */}
      <View style={styles.quickRow}>
        {scooterApps.map((app) => (
          <View
            key={app.id}
            style={[styles.quickCard, styles.miniCard, !app.available && styles.miniCardOff]}
          >
            <Ionicons
              name="bicycle"
              size={18}
              color={app.available ? colors.text : colors.textMuted}
            />
            <Text
              style={[styles.miniCardTitle, !app.available && styles.miniCardTitleOff]}
              numberOfLines={1}
            >
              {localizedField(app, 'name', language)}
            </Text>
            {app.available ? (
              <Pressable
                style={[styles.openButton, styles.miniOpenButton]}
                onPress={() => openTaxiApp(app.id)}
              >
                <Text style={styles.miniOpenText}>{t('gettingAround.open')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.miniUnavailable}>{t('gettingAround.unavailable')}</Text>
            )}
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('gettingAround.carRental')}</Text>
      <CitySelect value={city} onChange={changeCity} allowAll style={styles.citySelect} />
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('rentals.searchCars')}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      <View style={styles.bodyTypeRow}>
        <Pressable
          style={[styles.bodyTypeChip, bodyType === null && styles.bodyTypeChipActive]}
          onPress={() => setBodyType(null)}
        >
          <Ionicons name="apps" size={18} color={bodyType === null ? colors.background : colors.text} />
          <Text style={[styles.bodyTypeText, bodyType === null && styles.bodyTypeTextActive]}>{t('rentals.allTypes')}</Text>
        </Pressable>
        {BODY_TYPES.map((type) => {
          const active = bodyType === type;
          return (
            <Pressable
              key={type}
              style={[styles.bodyTypeChip, active && styles.bodyTypeChipActive]}
              onPress={() => setBodyType(active ? null : type)}
            >
              <MaterialCommunityIcons name={BODY_TYPE_ICONS[type]} size={20} color={active ? colors.background : colors.text} />
              <Text style={[styles.bodyTypeText, active && styles.bodyTypeTextActive]}>{t(`rentals.${type}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      {visibleCars.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardDescription}>{t('gettingAround.carRentalEmpty')}</Text>
        </View>
      ) : (
        visibleCars.map((car) => <RentalCarCard key={car.id} car={car} />)
      )}

      <Text style={styles.sectionTitle}>{t('gettingAround.estimatedFares')}</Text>
      <View style={styles.card}>
        {fares.map((fare) => (
          <View key={fare.route_en} style={styles.fareRow}>
            <Text style={styles.fareRoute}>{localizedField(fare, 'route', language)}</Text>
            <Text style={styles.farePrice}>
              {fare.low}-{fare.high} ₾
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  citySelect: { marginBottom: 10 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10 },
  bodyTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  bodyTypeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
  },
  bodyTypeChipActive: { backgroundColor: colors.safe, borderColor: colors.safe },
  bodyTypeText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  bodyTypeTextActive: { color: colors.background },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  quickCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  // Three-across variant of quickCard: tighter padding and smaller type so
  // three scooter apps fit on one line without wrapping.
  miniCard: {
    padding: 10,
    gap: 6,
  },
  miniCardTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  miniOpenButton: {
    width: '100%',
    paddingVertical: 6,
  },
  miniCardOff: {
    opacity: 0.55,
  },
  miniCardTitleOff: {
    color: colors.textMuted,
  },
  miniUnavailable: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },
  miniOpenText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '700',
  },
  quickCardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickOpenButton: {
    alignSelf: 'stretch',
  },
  recommendedBadge: {
    backgroundColor: colors.safe,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  recommendedText: {
    color: colors.background,
    fontSize: 11,
    fontWeight: '700',
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  openButton: {
    backgroundColor: colors.safe,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  openButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fareRoute: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  farePrice: {
    color: colors.safe,
    fontSize: 14,
    fontWeight: '700',
  },
});
