import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import scamsData from '../data/scams.json';
import { useLanguage } from '../i18n/LanguageContext';
import { localizedField } from '../lib/localizeData';
import { fetchScams } from '../lib/remoteData';
import type { Scam, ScamCategory, Severity } from '../lib/remoteData';
import { useRemoteData } from '../lib/useRemoteData';

function localizedLocationHint(scam: Scam, language: 'en' | 'ka' | 'ru'): string {
  if (language === 'ka') return scam.location_hint_ka;
  if (language === 'ru') return scam.location_hint_ru;
  return scam.location_hint;
}

const CATEGORY_ICONS: Record<ScamCategory, keyof typeof Ionicons.glyphMap> = {
  taxi: 'car',
  bar: 'wine',
  exchange: 'cash',
  street: 'walk',
  shop: 'storefront',
};

const CATEGORY_LABEL_KEYS: Record<ScamCategory, string> = {
  taxi: 'alerts.categoryTaxi',
  bar: 'alerts.categoryBar',
  exchange: 'alerts.categoryExchange',
  street: 'alerts.categoryStreet',
  shop: 'alerts.categoryShop',
};

const SEVERITY_COLORS: Record<Severity, string> = {
  low: colors.safe,
  medium: colors.warning,
  high: colors.risk,
};

const SEVERITY_LABEL_KEYS: Record<Severity, string> = {
  low: 'alerts.severityLow',
  medium: 'alerts.severityMedium',
  high: 'alerts.severityHigh',
};

const CATEGORIES: ScamCategory[] = ['taxi', 'bar', 'exchange', 'street', 'shop'];

export default function AlertsScreen() {
  const { t, language } = useLanguage();
  const scams = useRemoteData(scamsData as Scam[], fetchScams);
  const [activeCategory, setActiveCategory] = useState<ScamCategory | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filteredScams = useMemo(
    () => (activeCategory ? scams.filter((scam) => scam.category === activeCategory) : scams),
    [scams, activeCategory],
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setActiveCategory(null);
    // Data is bundled locally, so there's nothing to re-fetch yet — this
    // just resets the category filter and gives the standard pull-to-refresh
    // feedback. Once Phase 4 wires up Supabase, this is where we'd re-fetch.
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredScams}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.safe}
          />
        }
        ListHeaderComponent={
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={CATEGORIES}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.filterRow}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.chip, activeCategory === item && styles.chipActive]}
                onPress={() => setActiveCategory(activeCategory === item ? null : item)}
              >
                <Ionicons
                  name={CATEGORY_ICONS[item]}
                  size={14}
                  color={activeCategory === item ? colors.background : colors.textMuted}
                />
                <Text
                  style={[styles.chipText, activeCategory === item && styles.chipTextActive]}
                >
                  {t(CATEGORY_LABEL_KEYS[item])}
                </Text>
              </Pressable>
            )}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Ionicons name={CATEGORY_ICONS[item.category]} size={18} color={colors.text} />
                <Text style={styles.cardTitle}>{localizedField(item, 'title', language)}</Text>
              </View>
              <View
                style={[styles.severityBadge, { backgroundColor: SEVERITY_COLORS[item.severity] }]}
              >
                <Text style={styles.severityText}>{t(SEVERITY_LABEL_KEYS[item.severity])}</Text>
              </View>
            </View>
            <Text style={styles.cardDescription}>
              {localizedField(item, 'description', language)}
            </Text>
            <Text style={styles.cardLocation}>{localizedLocationHint(item, language)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: 24,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    gap: 6,
  },
  chipActive: {
    backgroundColor: colors.safe,
    borderColor: colors.safe,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.background,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  severityBadge: {
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  severityText: {
    color: colors.background,
    fontSize: 11,
    fontWeight: '700',
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  cardLocation: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
});
