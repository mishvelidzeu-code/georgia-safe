import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import {
  createPartnerCar,
  deletePartnerCar,
  fetchPartnerCars,
} from '../lib/rentals';
import type { Partner, PartnerCar } from '../lib/rentals';

const MAX_PHOTOS = 6;

const EMPTY = {
  make: '',
  model: '',
  year: '',
  seats: '',
  price: '',
  city: '',
  description: '',
};

type Props = {
  partner: Partner;
  visible: boolean;
  onClose: () => void;
};

/**
 * Where a rental company manages its own listings. Only reachable by a user
 * whose partner row exists; adding cars additionally requires that row to be
 * approved, which RLS enforces server-side as well as the guard below.
 *
 * Every listing a partner saves starts unapproved, and editing an approved one
 * sends it back for review (a database trigger does that, not this screen), so
 * nothing reaches tourists without the admin seeing it.
 */
export default function PartnerDashboard({ partner, visible, onClose }: Props) {
  const { t } = useLanguage();
  const [cars, setCars] = useState<PartnerCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY, city: partner.city });
  const [photos, setPhotos] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCars(await fetchPartnerCars(partner.id));
    } catch {
      setCars([]);
    }
    setLoading(false);
  }, [partner.id]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const pickPhotos = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('review.permTitle'), t('review.permLibrary'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.6,
      base64: true,
    });
    if (result.canceled) return;
    const picked = result.assets
      .map((a) => a.base64)
      .filter((b): b is string => typeof b === 'string');
    setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
  }, [photos.length, t]);

  const save = useCallback(async () => {
    if (!draft.make.trim() || !draft.model.trim() || !draft.city.trim()) {
      Alert.alert(t('admin.invalidTitle'), t('rentals.needFields'));
      return;
    }
    setSaving(true);
    const ok = await createPartnerCar(partner.id, {
      make: draft.make,
      model: draft.model,
      year: draft.year ? Number(draft.year) : undefined,
      seats: draft.seats ? Number(draft.seats) : undefined,
      pricePerDay: draft.price ? Number(draft.price) : undefined,
      city: draft.city,
      description: draft.description,
      photosBase64: photos,
    });
    setSaving(false);
    if (!ok) {
      Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
      return;
    }
    setDraft({ ...EMPTY, city: partner.city });
    setPhotos([]);
    Alert.alert(t('rentals.carSavedTitle'), t('rentals.carSavedBody'));
    await load();
  }, [draft, load, partner, photos, t]);

  const confirmDelete = useCallback(
    (car: PartnerCar) => {
      Alert.alert(t('admin.deleteTitle'), `${car.make} ${car.model}`, [
        { text: t('admin.cancel'), style: 'cancel' },
        {
          text: t('admin.delete'),
          style: 'destructive',
          onPress: async () => {
            await deletePartnerCar(car.id);
            await load();
          },
        },
      ]);
    },
    [load, t],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{t('rentals.dashboard')}</Text>
            <Text style={styles.company}>{partner.companyName}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        {!partner.approved ? (
          <Text style={styles.pending}>{t('rentals.notApproved')}</Text>
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.text} />
        ) : (
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={cars}
            keyExtractor={(car) => car.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('rentals.addCar')}</Text>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={draft.make}
                    placeholder={t('rentals.make')}
                    placeholderTextColor={colors.textMuted}
                    onChangeText={(make) => setDraft((d) => ({ ...d, make }))}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={draft.model}
                    placeholder={t('rentals.model')}
                    placeholderTextColor={colors.textMuted}
                    onChangeText={(model) => setDraft((d) => ({ ...d, model }))}
                  />
                </View>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={draft.year}
                    keyboardType="number-pad"
                    placeholder={t('rentals.year')}
                    placeholderTextColor={colors.textMuted}
                    onChangeText={(year) => setDraft((d) => ({ ...d, year }))}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={draft.seats}
                    keyboardType="number-pad"
                    placeholder={t('rentals.seatsField')}
                    placeholderTextColor={colors.textMuted}
                    onChangeText={(seats) => setDraft((d) => ({ ...d, seats }))}
                  />
                </View>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={draft.price}
                    keyboardType="number-pad"
                    placeholder={t('rentals.priceField')}
                    placeholderTextColor={colors.textMuted}
                    onChangeText={(price) => setDraft((d) => ({ ...d, price }))}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={draft.city}
                    placeholder={t('rentals.cityField')}
                    placeholderTextColor={colors.textMuted}
                    onChangeText={(city) => setDraft((d) => ({ ...d, city }))}
                  />
                </View>
                <TextInput
                  style={[styles.input, { minHeight: 70 }]}
                  value={draft.description}
                  multiline
                  placeholder={t('rentals.descriptionField')}
                  placeholderTextColor={colors.textMuted}
                  onChangeText={(description) => setDraft((d) => ({ ...d, description }))}
                />

                <Pressable style={styles.photoButton} onPress={() => void pickPhotos()}>
                  <Ionicons name="images" size={16} color={colors.text} />
                  <Text style={styles.photoButtonText}>
                    {photos.length > 0
                      ? t('rentals.photosCount').replace('{n}', String(photos.length))
                      : t('rentals.addPhotos')}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.saveButton}
                  disabled={saving}
                  onPress={() => void save()}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.saveText}>{t('rentals.saveCar')}</Text>
                  )}
                </Pressable>
              </View>
            }
            ListEmptyComponent={<Text style={styles.empty}>{t('rentals.noCars')}</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.carRow}>
                  {item.photoUrls[0] ? (
                    <Image
                      source={{ uri: item.photoUrls[0] }}
                      style={styles.thumb}
                      contentFit="cover"
                    />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      {item.make} {item.model}
                    </Text>
                    <Text style={styles.meta}>
                      {item.city}
                      {item.pricePerDay !== null ? ` · ${item.pricePerDay}₾` : ''}
                    </Text>
                    <Text
                      style={[styles.status, item.approved ? styles.statusLive : styles.statusPending]}
                    >
                      {item.approved ? t('rentals.live') : t('rentals.pendingReview')}
                    </Text>
                  </View>
                  <Pressable onPress={() => confirmDelete(item)} hitSlop={10}>
                    <Ionicons name="trash" size={18} color={colors.risk} />
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  company: { color: colors.textMuted, fontSize: 13 },
  pending: { color: colors.textMuted, fontSize: 14, lineHeight: 20, padding: 24, textAlign: 'center' },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 48, gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 12 },
  status: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  statusLive: { color: colors.safe },
  statusPending: { color: colors.warning },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 13,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoButtonText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  saveButton: {
    backgroundColor: colors.safe,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  carRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 60, height: 45, borderRadius: 8, backgroundColor: colors.background },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
});
