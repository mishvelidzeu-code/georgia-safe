import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchRideListings } from '../lib/rentals';
import type { PartnerListing, RideCategory } from '../lib/rentals';
import CitySelect from './CitySelect';
import RideListingCard from './RideListingCard';

type Props = {
  /** Which service to list; null keeps the modal closed. */
  category: RideCategory | null;
  /** Shared with the car-rental section, so the tourist picks the city once. */
  city: string | null;
  onChangeCity: (city: string | null) => void;
  onClose: () => void;
};

export const RIDE_TEXT_KEYS: Record<RideCategory, { title: string; hint: string; empty: string }> = {
  airport_transfer: { title: 'gettingAround.transfer', hint: 'gettingAround.ridesHint', empty: 'gettingAround.ridesEmpty' },
  private_taxi: { title: 'gettingAround.privateTaxi', hint: 'gettingAround.ridesHint', empty: 'gettingAround.ridesEmpty' },
  bike_rental: { title: 'gettingAround.bikes', hint: 'gettingAround.bikesHint', empty: 'gettingAround.bikesEmpty' },
};

/** Full-screen list of approved transfer, private-taxi or bike listings for one city. */
export default function RideServicesModal({ category, city, onChangeCity, onClose }: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const text = category ? RIDE_TEXT_KEYS[category] : null;
  const [listings, setListings] = useState<PartnerListing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!category) return;
    let cancelled = false;
    setListings([]);
    setLoading(true);
    fetchRideListings(category, city ?? undefined)
      .catch(() => [])
      .then((rows) => {
        if (cancelled) return;
        setListings(rows);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, city]);

  return (
    <Modal visible={category !== null} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 24) + 8 }]}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
            <Text style={styles.backText}>{t('common.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{text ? t(text.title) : ''}</Text>
        </View>
        <Text style={styles.hint}>{text ? t(text.hint) : ''}</Text>
        <CitySelect value={city} onChange={onChangeCity} allowAll style={styles.citySelect} />
        {loading ? (
          <ActivityIndicator color={colors.safe} style={styles.loading} />
        ) : (
          <FlatList
            data={listings}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <RideListingCard listing={item} />}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{text ? t(text.empty) : ''}</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: colors.text,
    fontSize: 15,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 10,
  },
  citySelect: { marginBottom: 12 },
  loading: { marginTop: 32 },
  empty: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
