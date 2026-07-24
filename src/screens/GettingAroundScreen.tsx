import { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import taxiGuide from '../data/taxi_guide.json';
import rentalsData from '../data/rentals.json';
import { useLanguage } from '../i18n/LanguageContext';
import { localizedField, localizedList } from '../lib/localizeData';

type RentalPartner = {
  id: string;
  name_en: string;
  name_ka: string;
  name_ru: string;
  phone: string;
  note_en: string;
  note_ka: string;
  note_ru: string;
};

const carRentals = rentalsData.car_rentals as RentalPartner[];
const scooterRentals = rentalsData.scooter_rentals as RentalPartner[];

function callNumber(phone: string) {
  // Uses the cellular voice network, not internet data — works offline too.
  Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
}

type TaxiApp = {
  id: string;
  name: string;
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

const APP_URLS: Record<string, { scheme: string; web: string }> = {
  bolt: { scheme: 'bolt://', web: 'https://bolt.eu/en/' },
  yandex_go: { scheme: 'yandextaxi://', web: 'https://go.yandex.com/' },
};

async function openTaxiApp(appId: string) {
  const urls = APP_URLS[appId];
  if (!urls) return;

  // iOS throws if the scheme isn't declared in LSApplicationQueriesSchemes
  // (see app.json ios.infoPlist) instead of just returning false — always
  // fall back to the web URL on any failure so the button never dead-ends.
  try {
    const canOpen = await Linking.canOpenURL(urls.scheme);
    await Linking.openURL(canOpen ? urls.scheme : urls.web);
  } catch {
    await Linking.openURL(urls.web);
  }
}

function localizedAppName(app: TaxiApp, language: 'en' | 'ka' | 'ru'): string {
  if (language === 'ka') return app.name_ka;
  if (language === 'ru') return app.name_ru;
  return app.name;
}

const QUICK_APP_IDS = ['bolt', 'yandex_go'];

export default function GettingAroundScreen() {
  const { t, language } = useLanguage();
  const tips = localizedList(taxiGuide, 'tips', language);
  const [refreshing, setRefreshing] = useState(false);

  const quickApps = apps.filter((app) => QUICK_APP_IDS.includes(app.id));
  const otherApps = apps.filter((app) => !QUICK_APP_IDS.includes(app.id));

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Data is bundled locally, so there's nothing to re-fetch yet — this
    // just gives the standard pull-to-refresh feedback. Once Phase 4 wires
    // up Supabase, this is where we'd re-fetch fares/tips/partners.
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.safe} />
      }
    >
      <Text style={styles.sectionTitle}>{t('gettingAround.title')}</Text>
      <Text style={styles.note}>{localizedField(taxiGuide, 'note', language)}</Text>

      {/* Bolt / Yandex Go are the two most-used ride apps — always pinned as
          a quick side-by-side row at the top so they're the first thing
          a tourist taps, before anything else on this screen. */}
      <View style={styles.quickRow}>
        {quickApps.map((app) => (
          <View key={app.id} style={styles.quickCard}>
            <Ionicons name="car" size={22} color={colors.text} />
            <Text style={styles.quickCardTitle}>{localizedAppName(app, language)}</Text>
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

      {quickApps.map((app) => (
        <View key={`${app.id}-details`} style={styles.card}>
          <Text style={styles.cardTitle}>{localizedAppName(app, language)}</Text>
          <Text style={styles.cardDescription}>
            {localizedField(app, 'description', language)}
          </Text>
        </View>
      ))}

      {otherApps.map((app) => (
        <View key={app.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="car" size={20} color={colors.text} />
            <Text style={styles.cardTitle}>{localizedAppName(app, language)}</Text>
          </View>
          <Text style={styles.cardDescription}>
            {localizedField(app, 'description', language)}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>{t('gettingAround.carRental')}</Text>
      {carRentals.map((partner) => (
        <View key={partner.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="car-sport" size={20} color={colors.text} />
            <Text style={styles.cardTitle}>{localizedField(partner, 'name', language)}</Text>
          </View>
          <Text style={styles.cardDescription}>{localizedField(partner, 'note', language)}</Text>
          <Pressable style={styles.openButton} onPress={() => callNumber(partner.phone)}>
            <Text style={styles.openButtonText}>
              {t('common.call')} {partner.phone}
            </Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>{t('gettingAround.scooterRental')}</Text>
      {scooterRentals.map((partner) => (
        <View key={partner.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="bicycle" size={20} color={colors.text} />
            <Text style={styles.cardTitle}>{localizedField(partner, 'name', language)}</Text>
          </View>
          <Text style={styles.cardDescription}>{localizedField(partner, 'note', language)}</Text>
          <Pressable style={styles.openButton} onPress={() => callNumber(partner.phone)}>
            <Text style={styles.openButtonText}>
              {t('common.call')} {partner.phone}
            </Text>
          </Pressable>
        </View>
      ))}

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

      <Text style={styles.sectionTitle}>{t('gettingAround.tips')}</Text>
      <View style={styles.card}>
        {tips.map((tip) => (
          <Text key={tip} style={styles.tip}>
            • {tip}
          </Text>
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
  note: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
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
  quickCardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickOpenButton: {
    alignSelf: 'stretch',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
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
  tip: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
});
