import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  deleteSubmission,
  fetchAdminSubmissions,
  setSubmissionApproved,
  updateAdminSubmission,
} from '../../lib/admin';
import type { AdminSubmission } from '../../lib/admin';
import { PLACE_SUBMISSION_CATEGORIES } from '../../lib/placeSubmissions';
import type { PlaceSubmissionCategory, PlaceSubmissionKind } from '../../lib/placeSubmissions';

type StatusFilter = 'all' | 'pending' | 'published' | 'resolved';
type TypeFilter = 'all' | PlaceSubmissionKind;
type QueueRow =
  | { key: string; type: 'section'; title: string; count: number }
  | { key: string; type: 'submission'; item: AdminSubmission; compact: boolean };

type EditDraft = {
  category: PlaceSubmissionCategory;
  comment: string;
  lat: string;
  lng: string;
};

const CATEGORY_LABEL_KEYS: Record<PlaceSubmissionCategory, string> = {
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

/** Pending reports are prominent; already-published reports stay compact below. */
export default function AdminSubmissions() {
  const { t } = useLanguage();
  const [items, setItems] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PlaceSubmissionCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expandedSenderId, setExpandedSenderId] = useState<string | null>(null);
  const [expandedPublishedId, setExpandedPublishedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchAdminSubmissions());
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const matchesQuery = !normalizedQuery || [
        item.senderName,
        item.senderEmail,
        item.comment,
        item.category,
        item.kind,
        item.lat.toFixed(5),
        item.lng.toFixed(5),
      ].filter(Boolean).join(' ').toLocaleLowerCase().includes(normalizedQuery);
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesType = typeFilter === 'all' || item.kind === typeFilter;
      const itemStatus: Exclude<StatusFilter, 'all'> = item.resolvedAt
        ? 'resolved'
        : item.approved
          ? 'published'
          : 'pending';
      return matchesQuery && matchesCategory && matchesType && (statusFilter === 'all' || statusFilter === itemStatus);
    });
  }, [items, query, categoryFilter, statusFilter, typeFilter]);

  const rows = useMemo<QueueRow[]>(() => {
    const pending = filteredItems.filter((item) => !item.approved);
    const published = filteredItems.filter((item) => item.approved);
    const queueRows: QueueRow[] = [];
    if (pending.length) {
      queueRows.push({ key: 'pending-title', type: 'section', title: t('admin.pendingQueue'), count: pending.length });
      queueRows.push(...pending.map((item) => ({ key: item.id, type: 'submission' as const, item, compact: false })));
    }
    if (published.length) {
      queueRows.push({ key: 'published-title', type: 'section', title: t('admin.publishedQueue'), count: published.length });
      queueRows.push(...published.map((item) => ({ key: item.id, type: 'submission' as const, item, compact: true })));
    }
    return queueRows;
  }, [filteredItems, t]);

  const toggleApproval = useCallback(async (item: AdminSubmission) => {
    setBusyId(item.id);
    const ok = await setSubmissionApproved(item.id, !item.approved);
    setBusyId(null);
    if (!ok) {
      Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
      return;
    }
    setItems((previous) => previous.map((row) => {
      if (row.id !== item.id) return row;
      return item.approved
        ? { ...row, resolvedAt: new Date().toISOString(), resolvedNotified: true }
        : { ...row, approved: true, resolvedAt: null };
    }));
  }, [t]);

  const confirmDelete = useCallback((item: AdminSubmission) => {
    Alert.alert(t('admin.deleteTitle'), t('admin.deleteBody'), [
      { text: t('admin.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusyId(item.id);
          const ok = await deleteSubmission(item.id);
          setBusyId(null);
          if (!ok) {
            Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
            return;
          }
          setItems((previous) => previous.filter((row) => row.id !== item.id));
        },
      },
    ]);
  }, [t]);

  function startEditing(item: AdminSubmission) {
    setEditingId(item.id);
    setDraft({ category: item.category, comment: item.comment ?? '', lat: String(item.lat), lng: String(item.lng) });
  }

  async function saveEdit(item: AdminSubmission) {
    if (!draft) return;
    const lat = Number(draft.lat.replace(',', '.'));
    const lng = Number(draft.lng.replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert(t('admin.invalidTitle'), t('admin.invalidCoordinates'));
      return;
    }
    setBusyId(item.id);
    const ok = await updateAdminSubmission(item.id, { category: draft.category, comment: draft.comment.trim() || null, lat, lng });
    setBusyId(null);
    if (!ok) {
      Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
      return;
    }
    setItems((previous) => previous.map((row) => row.id === item.id ? {
      ...row, category: draft.category, comment: draft.comment.trim() || null, lat, lng,
    } : row));
    setEditingId(null);
    setDraft(null);
  }

  function renderSender(item: AdminSubmission) {
    const expanded = expandedSenderId === item.id;
    const senderSummary = item.senderName || item.senderEmail || t('admin.senderUnknown');
    return (
      <View style={styles.senderBox}>
        <Pressable style={styles.senderHeader} onPress={() => setExpandedSenderId(expanded ? null : item.id)}>
          <Ionicons name="person-circle-outline" size={20} color={colors.textMuted} />
          <View style={styles.senderHeading}>
            <Text style={styles.senderLabel}>{t('admin.sender')}</Text>
            <Text style={styles.senderSummary} numberOfLines={1}>{senderSummary}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        {expanded && (
          <View style={styles.senderDetails}>
            <Text style={styles.senderDetail}><Text style={styles.detailLabel}>{t('admin.senderName')}: </Text>{item.senderName || t('admin.senderUnknown')}</Text>
            <Text style={styles.senderDetail}><Text style={styles.detailLabel}>{t('admin.senderEmail')}: </Text>{item.senderEmail || t('admin.senderUnknown')}</Text>
            <Text style={styles.senderDetail}><Text style={styles.detailLabel}>{t('admin.account')}: </Text>{item.authorId || t('admin.senderUnknown')}</Text>
          </View>
        )}
      </View>
    );
  }

  function renderEditForm(item: AdminSubmission) {
    if (editingId !== item.id || !draft) return null;
    return (
      <View style={styles.editBox}>
        <Text style={s.label}>{t('admin.category')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PLACE_SUBMISSION_CATEGORIES.map((category) => (
            <Pressable key={category} style={[s.chip, draft.category === category && s.chipActive]} onPress={() => setDraft({ ...draft, category })}>
              <Text style={[s.chipText, draft.category === category && s.chipTextActive]}>{t(CATEGORY_LABEL_KEYS[category])}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput style={[s.input, styles.commentInput]} value={draft.comment} onChangeText={(comment) => setDraft({ ...draft, comment })} placeholder={t('admin.comment')} placeholderTextColor={colors.textMuted} multiline />
        <View style={styles.coordinateRow}>
          <TextInput style={[s.input, styles.coordinateInput]} value={draft.lat} onChangeText={(lat) => setDraft({ ...draft, lat })} keyboardType="decimal-pad" placeholder="Latitude" placeholderTextColor={colors.textMuted} />
          <TextInput style={[s.input, styles.coordinateInput]} value={draft.lng} onChangeText={(lng) => setDraft({ ...draft, lng })} keyboardType="decimal-pad" placeholder="Longitude" placeholderTextColor={colors.textMuted} />
        </View>
        <View style={s.row}>
          <Pressable style={[s.button, s.buttonPrimary]} disabled={busyId === item.id} onPress={() => void saveEdit(item)}><Ionicons name="save-outline" size={16} color={colors.white} /><Text style={s.buttonText}>{t('admin.save')}</Text></Pressable>
          <Pressable style={[s.button, s.buttonNeutral]} onPress={() => { setEditingId(null); setDraft(null); }}><Text style={s.buttonText}>{t('admin.cancel')}</Text></Pressable>
        </View>
      </View>
    );
  }

  function renderSubmission(item: AdminSubmission, compact: boolean) {
    const expanded = expandedPublishedId === item.id;
    const statusLabel = item.resolvedAt ? t('admin.resolved') : item.approved ? t('admin.approved') : t('admin.pending');
    const statusColor = item.resolvedAt ? colors.textMuted : item.approved ? colors.safe : colors.warning;
    const title = `${item.kind === 'alert' ? '🔴' : '🟢'} ${item.kind === 'alert' ? t('admin.alertReport') : t('admin.positiveReport')} · ${t(CATEGORY_LABEL_KEYS[item.category])}`;

    if (compact) {
      return (
        <View style={[s.card, styles.compactCard]}>
          <Pressable style={styles.compactHeader} onPress={() => setExpandedPublishedId(expanded ? null : item.id)}>
            <View style={styles.compactCopy}>
              <Text style={s.cardTitle} numberOfLines={1}>{title}</Text>
              <Text style={s.cardMeta}>{new Date(item.createdAt).toLocaleDateString()} · {item.senderName || item.senderEmail || t('admin.senderUnknown')}</Text>
            </View>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={19} color={colors.textMuted} />
          </Pressable>
          <View style={[s.badge, { backgroundColor: statusColor }]}><Text style={s.badgeText}>{statusLabel}</Text></View>
          {expanded && (
            <View style={styles.expandedContent}>
              <Image source={{ uri: item.photoUrl }} style={styles.compactPhoto} contentFit="cover" />
              {item.comment ? <Text style={s.cardBody}>{item.comment}</Text> : null}
              <Text style={s.cardMeta}>{item.lat.toFixed(5)}, {item.lng.toFixed(5)}</Text>
              {renderSender(item)}
              {renderEditForm(item)}
              {editingId !== item.id && (
                <View style={s.row}>
                  <Pressable style={[s.button, s.buttonNeutral]} onPress={() => startEditing(item)}><Ionicons name="create-outline" size={16} color={colors.white} /><Text style={s.buttonText}>{t('admin.edit')}</Text></Pressable>
                  {item.kind === 'alert' && !item.resolvedAt && <Pressable style={[s.button, s.buttonPrimary]} disabled={busyId === item.id} onPress={() => void toggleApproval(item)}><Ionicons name="checkmark-done" size={16} color={colors.white} /><Text style={s.buttonText}>{t('admin.resolve')}</Text></Pressable>}
                  <Pressable style={[s.button, s.buttonDanger]} disabled={busyId === item.id} onPress={() => confirmDelete(item)}><Ionicons name="trash" size={16} color={colors.white} /><Text style={s.buttonText}>{t('admin.delete')}</Text></Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      );
    }

    return (
      <View style={s.card}>
        <Image source={{ uri: item.photoUrl }} style={s.photo} contentFit="cover" />
        <View style={[s.badge, { backgroundColor: statusColor }]}><Text style={s.badgeText}>{statusLabel}</Text></View>
        <Text style={s.cardTitle}>{title}</Text>
        {item.comment ? <Text style={s.cardBody}>{item.comment}</Text> : null}
        <Text style={s.cardMeta}>{item.lat.toFixed(5)}, {item.lng.toFixed(5)} · {new Date(item.createdAt).toLocaleDateString()}</Text>
        {renderSender(item)}
        <View style={s.row}>
          <Pressable style={[s.button, s.buttonPrimary]} disabled={busyId === item.id} onPress={() => void toggleApproval(item)}><Ionicons name="checkmark" size={16} color={colors.white} /><Text style={s.buttonText}>{t('admin.approve')}</Text></Pressable>
          <Pressable style={[s.button, s.buttonDanger]} disabled={busyId === item.id} onPress={() => confirmDelete(item)}><Ionicons name="trash" size={16} color={colors.white} /><Text style={s.buttonText}>{t('admin.delete')}</Text></Pressable>
        </View>
      </View>
    );
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} color={colors.text} />;

  return (
    <FlatList
      style={s.list}
      contentContainerStyle={s.listContent}
      data={rows}
      keyExtractor={(row) => row.key}
      onRefresh={load}
      refreshing={loading}
      ListHeaderComponent={(
        <View style={styles.filters}>
          <View style={styles.searchRow}><Ionicons name="search" size={18} color={colors.textMuted} /><TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder={t('admin.searchSubmissions')} placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} /></View>
          <Text style={s.label}>{t('admin.status')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(['all', 'pending', 'published', 'resolved'] as StatusFilter[]).map((status) => <Pressable key={status} style={[s.chip, statusFilter === status && s.chipActive]} onPress={() => setStatusFilter(status)}><Text style={[s.chipText, statusFilter === status && s.chipTextActive]}>{t(`admin.filter.${status}`)}</Text></Pressable>)}</ScrollView>
          <Text style={s.label}>{t('admin.reportType')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(['all', 'alert', 'positive'] as TypeFilter[]).map((type) => <Pressable key={type} style={[s.chip, typeFilter === type && s.chipActive]} onPress={() => setTypeFilter(type)}><Text style={[s.chipText, typeFilter === type && s.chipTextActive]}>{type === 'all' ? t('admin.filter.all') : type === 'alert' ? t('admin.alertReport') : t('admin.positiveReport')}</Text></Pressable>)}</ScrollView>
          <Text style={s.label}>{t('admin.category')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><Pressable style={[s.chip, categoryFilter === 'all' && s.chipActive]} onPress={() => setCategoryFilter('all')}><Text style={[s.chipText, categoryFilter === 'all' && s.chipTextActive]}>{t('admin.filter.all')}</Text></Pressable>{PLACE_SUBMISSION_CATEGORIES.map((category) => <Pressable key={category} style={[s.chip, categoryFilter === category && s.chipActive]} onPress={() => setCategoryFilter(category)}><Text style={[s.chipText, categoryFilter === category && s.chipTextActive]}>{t(CATEGORY_LABEL_KEYS[category])}</Text></Pressable>)}</ScrollView>
          <Text style={styles.resultCount}>{t('admin.resultsCount').replace('{count}', String(filteredItems.length))}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={s.empty}>{items.length ? t('admin.noMatchingSubmissions') : t('admin.noSubmissions')}</Text>}
      renderItem={({ item }) => item.type === 'section'
        ? <View style={styles.section}><Text style={styles.sectionTitle}>{item.title}</Text><Text style={styles.sectionCount}>{item.count}</Text></View>
        : renderSubmission(item.item, item.compact)}
    />
  );
}

const styles = StyleSheet.create({
  filters: { gap: 8, marginBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10 },
  searchInput: { flex: 1, minHeight: 42, color: colors.text, fontSize: 14 },
  chips: { gap: 8, paddingRight: 16 },
  resultCount: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: -2 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sectionCount: { color: colors.white, backgroundColor: colors.textMuted, borderRadius: 999, minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  senderBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, overflow: 'hidden' },
  senderHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, paddingVertical: 8 },
  senderHeading: { flex: 1 },
  senderLabel: { color: colors.textMuted, fontSize: 11 },
  senderSummary: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 1 },
  senderDetails: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 9, paddingVertical: 8, gap: 3 },
  senderDetail: { color: colors.text, fontSize: 12, lineHeight: 18 },
  detailLabel: { color: colors.textMuted, fontWeight: '600' },
  compactCard: { gap: 6, paddingVertical: 10 },
  compactHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactCopy: { flex: 1, gap: 3 },
  expandedContent: { gap: 8, marginTop: 4 },
  compactPhoto: { width: '100%', height: 130, borderRadius: 8, backgroundColor: colors.background },
  editBox: { gap: 8, backgroundColor: colors.background, borderRadius: 9, padding: 10 },
  commentInput: { minHeight: 70, textAlignVertical: 'top' },
  coordinateRow: { flexDirection: 'row', gap: 8 },
  coordinateInput: { flex: 1 },
});
