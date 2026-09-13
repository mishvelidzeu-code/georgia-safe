import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchPlaceSubmissions, PLACE_SUBMISSION_CATEGORIES } from '../lib/placeSubmissions';
import type { PlaceSubmission, PlaceSubmissionCategory } from '../lib/placeSubmissions';

const CATEGORY_ICONS: Record<PlaceSubmissionCategory, keyof typeof Ionicons.glyphMap> = {
  auto: 'car-sport', taxi: 'car', shop: 'storefront', restaurant: 'restaurant', bar: 'beer', exchange: 'cash',
  street: 'walk', school: 'school', atm: 'card', pharmacy: 'medkit', other: 'ellipsis-horizontal-circle',
};

/** One colour per category so the filter row and the post badges read at a glance. */
const CATEGORY_COLORS: Record<PlaceSubmissionCategory, string> = {
  auto: '#3b82f6', taxi: '#eab308', shop: '#a855f7', restaurant: '#f97316', bar: '#ec4899', exchange: '#22c55e',
  street: '#0ea5e9', school: '#6366f1', atm: '#14b8a6', pharmacy: '#ef4444', other: '#94a3b8',
};

/** Filter order: All, Other, then every remaining category the app knows. */
const CATEGORY_FILTERS: (PlaceSubmissionCategory | null)[] = [
  null,
  'other',
  ...PLACE_SUBMISSION_CATEGORIES.filter((category) => category !== 'other'),
];

function categoryLabelKey(category: PlaceSubmissionCategory): string {
  return `newPlace.category${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

/** 20% of the category colour — a tint for the label pill. */
function withAlpha(hex: string): string {
  return `${hex}33`;
}

function openGoogleMaps(lat: number, lng: number) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.openURL(url).catch(() => {});
}

export default function AlertsScreen() {
  const { t, language } = useLanguage();
  const [posts, setPosts] = useState<PlaceSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<PlaceSubmissionCategory | null>(null);
  // Photo opened full-screen by a tap; a second tap anywhere closes it.
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchPlaceSubmissions();
      setPosts(rows
        .filter((row) => row.kind === 'alert')
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // A newly approved report appears as soon as this screen is opened again;
  // the visitor does not need to close/restart the application.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filteredPosts = useMemo(
    () => posts.filter((post) => !activeCategory || post.category === activeCategory),
    [activeCategory, posts],
  );
  const locale = language === 'ka' ? 'ka-GE' : language === 'ru' ? 'ru-RU' : 'en-US';

  return (
    <View style={styles.container}>
      {loading ? <ActivityIndicator style={styles.loader} color={colors.safe} /> : <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.safe} />}
        ListHeaderComponent={<View><FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORY_FILTERS}
          keyExtractor={(item) => item ?? 'all'}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => {
            const active = activeCategory === item;
            const color = item ? CATEGORY_COLORS[item] : colors.safe;
            return <Pressable
              style={[styles.chip, { borderColor: color }, active && { backgroundColor: color }]}
              onPress={() => setActiveCategory(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={item ? CATEGORY_ICONS[item] : 'apps'} size={14} color={active ? colors.background : color} />
              <Text style={[styles.chipText, { color: active ? colors.background : color }]}>{item ? t(categoryLabelKey(item)) : t('alerts.categoryAll')}</Text>
            </Pressable>;
          }}
        /><Text style={styles.feedTitle}>{t('alerts.communityFeed')}</Text></View>}
        ListEmptyComponent={<Text style={styles.empty}>{t('alerts.noCommunityAlerts')}</Text>}
        renderItem={({ item }) => {
          const color = CATEGORY_COLORS[item.category];
          return <View style={styles.post}>
            <View style={styles.postHeader}>
              <View style={[styles.categoryPill, { backgroundColor: withAlpha(color) }]}>
                <Ionicons name={CATEGORY_ICONS[item.category]} size={13} color={color} />
                <Text style={[styles.categoryText, { color }]} numberOfLines={1}>{t(categoryLabelKey(item.category))}</Text>
              </View>
              <View style={styles.verified}>
                <Ionicons name="checkmark-circle" size={14} color={colors.safe} />
                <Text style={styles.verifiedText}>{t('alerts.verified')}</Text>
              </View>
            </View>
            <Pressable style={styles.photoWrap} onPress={() => setViewerUrl(item.photoUrl)} accessibilityRole="imagebutton">
              <Image source={{ uri: item.photoUrl }} style={styles.photo} contentFit="cover" transition={150} />
              <LinearGradient colors={['transparent', 'rgba(15,23,42,0.85)']} style={styles.photoShade} />
              <View style={styles.avoidChip}>
                <Ionicons name="warning" size={13} color={colors.white} />
                <Text style={styles.avoidText} numberOfLines={1}>{t('alerts.avoidObject')}</Text>
              </View>
              <View style={styles.expandHint}>
                <Ionicons name="expand" size={14} color={colors.white} />
              </View>
            </Pressable>
            {item.comment ? <Text style={styles.message}>{item.comment}</Text> : null}
            <View style={styles.footer}>
              <View style={styles.footerMeta}>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString(locale)}</Text>
                {item.expiresAt ? <Text style={styles.expires} numberOfLines={1}>{t('alerts.activeUntil').replace('{date}', new Date(item.expiresAt).toLocaleDateString(locale))}</Text> : null}
              </View>
              <Pressable style={styles.directions} onPress={() => openGoogleMaps(item.lat, item.lng)}>
                <Ionicons name="navigate" size={14} color={colors.background} />
                <Text style={styles.directionsText}>{t('map.getDirections')}</Text>
              </Pressable>
            </View>
          </View>;
        }}
      />}

      <Modal visible={viewerUrl !== null} animationType="fade" transparent onRequestClose={() => setViewerUrl(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewerUrl(null)}>
          {viewerUrl ? <Image source={{ uri: viewerUrl }} style={styles.viewerImage} contentFit="contain" transition={150} /> : null}
          <View style={styles.viewerClose}>
            <Ionicons name="close" size={26} color={colors.white} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: 80 },
  listContent: { paddingBottom: 24 },
  filterRow: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1.5, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8, gap: 6 },
  chipText: { fontSize: 13, fontWeight: '700' },
  feedTitle: { color: colors.text, fontSize: 17, fontWeight: '800', paddingHorizontal: 16, paddingBottom: 10 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingHorizontal: 36, paddingTop: 44, lineHeight: 20 },
  // Report card: category header, a large centred photo (tap to open
  // full-screen), the comment, then date and a filled "directions" button.
  post: { backgroundColor: colors.card, borderRadius: 18, marginHorizontal: 16, marginBottom: 14, padding: 12, gap: 10 },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  categoryPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 1 },
  categoryText: { fontSize: 13, fontWeight: '700' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { color: colors.safe, fontSize: 11, fontWeight: '700' },
  photoWrap: { alignSelf: 'center', width: '100%', height: 210, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.border },
  photo: { width: '100%', height: '100%' },
  photoShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80 },
  avoidChip: { position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.risk, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '80%' },
  avoidText: { color: colors.white, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  expandHint: { position: 'absolute', right: 10, top: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center' },
  message: { color: colors.text, fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  footerMeta: { flex: 1, gap: 2 },
  date: { color: colors.textMuted, fontSize: 11 },
  expires: { color: colors.warning, fontSize: 11, fontWeight: '600' },
  directions: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.safe, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  directionsText: { color: colors.background, fontSize: 12, fontWeight: '800' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', top: 56, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
