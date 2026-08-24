import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { deleteSafePlace, fetchAdminSafePlaces, upsertSafePlace } from '../../lib/admin';
import type { SafePlace, SafePlaceType } from '../../lib/remoteData';

const TYPES: SafePlaceType[] = ['pharmacy24', 'atm', 'hospital', 'police', 'toilet'];

const EMPTY = {
  id: '',
  name: '',
  type: 'pharmacy24' as SafePlaceType,
  address: '',
  lat: '',
  lng: '',
  open_24h: false,
};

/**
 * Add, edit and delete the curated safe places (pharmacies, ATMs, hospitals,
 * police, toilets) that the Map draws on top of the basemap.
 *
 * Coordinates are typed in rather than picked on a map: this is the same data
 * that ships in safe_places.json, and it must be a real, verified location —
 * an approximate pin dropped by hand is exactly how two ATMs ended up sitting
 * on top of landmark markers.
 */
export default function AdminSafePlaces() {
  const { t } = useLanguage();
  const [items, setItems] = useState<SafePlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchAdminSafePlaces());
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = useCallback((place: SafePlace) => {
    setDraft({
      id: place.id,
      name: place.name,
      type: place.type,
      address: place.address,
      lat: String(place.lat),
      lng: String(place.lng),
      open_24h: place.open_24h,
    });
  }, []);

  const save = useCallback(async () => {
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    // Georgia's bounding box, roughly — catches swapped lat/lng and typos
    // before they become a pin in the Black Sea.
    const valid =
      draft.id.trim() &&
      draft.name.trim() &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat > 41 &&
      lat < 44 &&
      lng > 39 &&
      lng < 47;
    if (!valid) {
      Alert.alert(t('admin.invalidTitle'), t('admin.invalidBody'));
      return;
    }
    setSaving(true);
    const ok = await upsertSafePlace({
      id: draft.id,
      name: draft.name,
      type: draft.type,
      address: draft.address,
      lat,
      lng,
      open_24h: draft.open_24h,
    });
    setSaving(false);
    if (!ok) {
      Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
      return;
    }
    setDraft(EMPTY);
    await load();
  }, [draft, load, t]);

  const confirmDelete = useCallback(
    (place: SafePlace) => {
      Alert.alert(t('admin.deleteTitle'), place.name, [
        { text: t('admin.cancel'), style: 'cancel' },
        {
          text: t('admin.delete'),
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteSafePlace(place.id);
            if (!ok) {
              Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
              return;
            }
            await load();
          },
        },
      ]);
    },
    [load, t],
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
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={[s.card, { marginBottom: 8 }]}>
          <Text style={s.cardTitle}>
            {draft.id ? t('admin.editPlace') : t('admin.newPlace')}
          </Text>
          <Text style={s.label}>{t('admin.fieldId')}</Text>
          <TextInput
            style={s.input}
            value={draft.id}
            autoCapitalize="none"
            placeholder="pharmacy_psp_batumi"
            placeholderTextColor={colors.textMuted}
            onChangeText={(id) => setDraft((d) => ({ ...d, id }))}
          />
          <Text style={s.label}>{t('admin.fieldName')}</Text>
          <TextInput
            style={s.input}
            value={draft.name}
            placeholderTextColor={colors.textMuted}
            onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
          />
          <Text style={s.label}>{t('admin.fieldType')}</Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {TYPES.map((type) => (
              <Pressable
                key={type}
                style={[s.chip, draft.type === type && s.chipActive]}
                onPress={() => setDraft((d) => ({ ...d, type }))}
              >
                <Text style={[s.chipText, draft.type === type && s.chipTextActive]}>{type}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>{t('admin.fieldAddress')}</Text>
          <TextInput
            style={s.input}
            value={draft.address}
            placeholderTextColor={colors.textMuted}
            onChangeText={(address) => setDraft((d) => ({ ...d, address }))}
          />
          <View style={s.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.label}>{t('admin.fieldLat')}</Text>
              <TextInput
                style={s.input}
                value={draft.lat}
                keyboardType="numbers-and-punctuation"
                placeholder="41.6981"
                placeholderTextColor={colors.textMuted}
                onChangeText={(lat) => setDraft((d) => ({ ...d, lat }))}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.label}>{t('admin.fieldLng')}</Text>
              <TextInput
                style={s.input}
                value={draft.lng}
                keyboardType="numbers-and-punctuation"
                placeholder="44.7978"
                placeholderTextColor={colors.textMuted}
                onChangeText={(lng) => setDraft((d) => ({ ...d, lng }))}
              />
            </View>
          </View>
          <Pressable
            style={[s.chip, draft.open_24h && s.chipActive, { alignSelf: 'flex-start' }]}
            onPress={() => setDraft((d) => ({ ...d, open_24h: !d.open_24h }))}
          >
            <Text style={[s.chipText, draft.open_24h && s.chipTextActive]}>
              {t('admin.field24h')}
            </Text>
          </Pressable>
          <View style={s.row}>
            <Pressable
              style={[s.button, s.buttonPrimary]}
              disabled={saving}
              onPress={() => void save()}
            >
              <Ionicons name="save" size={16} color={colors.white} />
              <Text style={s.buttonText}>{t('admin.save')}</Text>
            </Pressable>
            {draft.id ? (
              <Pressable style={[s.button, s.buttonNeutral]} onPress={() => setDraft(EMPTY)}>
                <Text style={s.buttonText}>{t('admin.cancel')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={s.empty}>{t('admin.noPlaces')}</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          <Text style={s.cardTitle}>{item.name}</Text>
          <Text style={s.cardMeta}>
            {item.type} · {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
            {item.open_24h ? ' · 24/7' : ''}
          </Text>
          {item.address ? <Text style={s.cardBody}>{item.address}</Text> : null}
          <View style={s.row}>
            <Pressable style={[s.button, s.buttonNeutral]} onPress={() => startEdit(item)}>
              <Ionicons name="create" size={16} color={colors.white} />
              <Text style={s.buttonText}>{t('admin.edit')}</Text>
            </Pressable>
            <Pressable style={[s.button, s.buttonDanger]} onPress={() => confirmDelete(item)}>
              <Ionicons name="trash" size={16} color={colors.white} />
              <Text style={s.buttonText}>{t('admin.delete')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}
