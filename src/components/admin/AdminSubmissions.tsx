import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  deleteSubmission,
  fetchAdminSubmissions,
  setSubmissionApproved,
} from '../../lib/admin';
import type { AdminSubmission } from '../../lib/admin';

/**
 * Moderation queue for tourist-submitted places. Pending rows come first so
 * the work to do is at the top; approving reveals the rating and comment to
 * every tourist and triggers the existing approval notification.
 */
export default function AdminSubmissions() {
  const { t } = useLanguage();
  const [items, setItems] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAdminSubmissions();
      // Pending first, then newest — fetchAdminSubmissions already sorts by date.
      setItems([...rows].sort((a, b) => Number(a.approved) - Number(b.approved)));
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleApproval = useCallback(
    async (item: AdminSubmission) => {
      setBusyId(item.id);
      const ok = await setSubmissionApproved(item.id, !item.approved);
      setBusyId(null);
      if (!ok) {
        Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
        return;
      }
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, approved: !row.approved } : row)),
      );
    },
    [t],
  );

  const confirmDelete = useCallback(
    (item: AdminSubmission) => {
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
            setItems((prev) => prev.filter((row) => row.id !== item.id));
          },
        },
      ]);
    },
    [t],
  );

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 32 }} color={colors.text} />;
  }

  return (
    <FlatList
      style={s.list}
      contentContainerStyle={s.listContent}
      data={items}
      keyExtractor={(item) => item.id}
      onRefresh={load}
      refreshing={loading}
      ListEmptyComponent={<Text style={s.empty}>{t('admin.noSubmissions')}</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          <Image source={{ uri: item.photoUrl }} style={s.photo} contentFit="cover" />
          <View
            style={[
              s.badge,
              { backgroundColor: item.approved ? colors.safe : colors.warning },
            ]}
          >
            <Text style={s.badgeText}>
              {item.approved ? t('admin.approved') : t('admin.pending')}
            </Text>
          </View>
          <Text style={s.cardTitle}>
            {'★'.repeat(item.rating)}
            {'☆'.repeat(5 - item.rating)} · {item.category}
          </Text>
          {item.comment ? <Text style={s.cardBody}>{item.comment}</Text> : null}
          <Text style={s.cardMeta}>
            {item.lat.toFixed(5)}, {item.lng.toFixed(5)} ·{' '}
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
          <View style={s.row}>
            <Pressable
              style={[s.button, item.approved ? s.buttonNeutral : s.buttonPrimary]}
              disabled={busyId === item.id}
              onPress={() => void toggleApproval(item)}
            >
              <Ionicons
                name={item.approved ? 'arrow-undo' : 'checkmark'}
                size={16}
                color={colors.white}
              />
              <Text style={s.buttonText}>
                {item.approved ? t('admin.unapprove') : t('admin.approve')}
              </Text>
            </Pressable>
            <Pressable
              style={[s.button, s.buttonDanger]}
              disabled={busyId === item.id}
              onPress={() => confirmDelete(item)}
            >
              <Ionicons name="trash" size={16} color={colors.white} />
              <Text style={s.buttonText}>{t('admin.delete')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}
