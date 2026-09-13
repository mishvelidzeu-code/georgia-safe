import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { deleteSubmission, setSubmissionApproved, updateAdminSubmission } from '../../lib/admin';
import { PLACE_SUBMISSION_CATEGORIES } from '../../lib/placeSubmissions';
import type { PlaceSubmission, PlaceSubmissionCategory } from '../../lib/placeSubmissions';

type Props = {
  submission: PlaceSubmission;
  /** Called after any successful change — the pin on the map is stale by then. */
  onSaved: () => void;
};

function categoryLabelKey(category: PlaceSubmissionCategory): string {
  return `newPlace.category${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

/** Edit, resolve or delete one community report straight from its map pin. */
export default function AdminSubmissionEditor({ submission, onSaved }: Props) {
  const { t } = useLanguage();
  const [category, setCategory] = useState<PlaceSubmissionCategory>(submission.category);
  const [comment, setComment] = useState(submission.comment ?? '');
  const [lat, setLat] = useState(String(submission.lat));
  const [lng, setLng] = useState(String(submission.lng));
  const [busy, setBusy] = useState(false);

  const fail = useCallback(() => Alert.alert(t('admin.errorTitle'), t('admin.errorBody')), [t]);

  const save = useCallback(async () => {
    const parsedLat = Number(lat.replace(',', '.'));
    const parsedLng = Number(lng.replace(',', '.'));
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      Alert.alert(t('admin.invalidTitle'), t('admin.invalidCoordinates'));
      return;
    }
    setBusy(true);
    const ok = await updateAdminSubmission(submission.id, { category, comment: comment.trim() || null, lat: parsedLat, lng: parsedLng });
    setBusy(false);
    ok ? onSaved() : fail();
  }, [category, comment, fail, lat, lng, onSaved, submission.id, t]);

  const resolve = useCallback(async () => {
    setBusy(true);
    const ok = await setSubmissionApproved(submission.id, false);
    setBusy(false);
    ok ? onSaved() : fail();
  }, [fail, onSaved, submission.id]);

  const confirmDelete = useCallback(() => {
    Alert.alert(t('admin.deleteTitle'), t('admin.deleteBody'), [
      { text: t('admin.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const ok = await deleteSubmission(submission.id);
          setBusy(false);
          ok ? onSaved() : fail();
        },
      },
    ]);
  }, [fail, onSaved, submission.id, t]);

  return (
    <View style={s.card}>
      <Image source={{ uri: submission.photoUrl }} style={s.photo} contentFit="cover" />
      <Text style={s.cardMeta}>
        {submission.kind === 'alert' ? t('admin.alertReport') : t('admin.positiveReport')} · {new Date(submission.createdAt).toLocaleDateString()}
      </Text>
      <Text style={s.label}>{t('admin.category')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {PLACE_SUBMISSION_CATEGORIES.map((item) => (
          <Pressable key={item} style={[s.chip, category === item && s.chipActive]} onPress={() => setCategory(item)}>
            <Text style={[s.chipText, category === item && s.chipTextActive]}>{t(categoryLabelKey(item))}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={s.label}>{t('admin.comment')}</Text>
      <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} value={comment} onChangeText={setComment} placeholderTextColor={colors.textMuted} multiline />
      <View style={s.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.label}>{t('admin.fieldLat')}</Text>
          <TextInput style={s.input} value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.label}>{t('admin.fieldLng')}</Text>
          <TextInput style={s.input} value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <View style={s.row}>
        <Pressable style={[s.button, s.buttonPrimary]} disabled={busy} onPress={() => void save()}>
          <Ionicons name="save-outline" size={16} color={colors.white} />
          <Text style={s.buttonText}>{t('admin.save')}</Text>
        </Pressable>
        {submission.kind === 'alert' && (
          <Pressable style={[s.button, s.buttonNeutral]} disabled={busy} onPress={() => void resolve()}>
            <Ionicons name="checkmark-done" size={16} color={colors.white} />
            <Text style={s.buttonText}>{t('admin.resolve')}</Text>
          </Pressable>
        )}
        <Pressable style={[s.button, s.buttonDanger]} disabled={busy} onPress={confirmDelete}>
          <Ionicons name="trash" size={16} color={colors.white} />
          <Text style={s.buttonText}>{t('admin.delete')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
