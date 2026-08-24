import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { localizedField } from '../../lib/localizeData';
import landmarksData from '../../data/landmarks.json';
import safePlacesData from '../../data/safe_places.json';
import {
  MAX_PHOTOS_PER_PLACE,
  deletePlacePhoto,
  fetchPlacePhotos,
  photoKey,
  uploadPlacePhoto,
} from '../../lib/placePhotos';
import type { PlacePhoto, PlacePhotoType } from '../../lib/placePhotos';
import type { SafePlace } from '../../lib/remoteData';

type Row = {
  key: string;
  id: string;
  type: PlacePhotoType;
  name: string;
};

type LandmarkRow = {
  id: string;
  name_en: string;
  name_ka: string;
  name_ru: string;
};

/**
 * Attaches up to two curated photos to any landmark or safe place. The photos
 * show in the map's info sheet for every tourist — unlike review photos, which
 * stay private, these are chosen by the admin and are public by design.
 *
 * The list is long (117 pins), so a search box is the only practical way to
 * reach a specific one.
 */
export default function AdminPlacePhotos() {
  const { t, language } = useLanguage();
  const [photos, setPhotos] = useState<Record<string, PlacePhoto[]>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPhotos(await fetchPlacePhotos());
    } catch {
      setPhotos({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    const landmarks = (landmarksData as LandmarkRow[]).map((l) => ({
      key: photoKey('landmark', l.id),
      id: l.id,
      type: 'landmark' as const,
      name: localizedField(l, 'name', language),
    }));
    const places = (safePlacesData as SafePlace[]).map((p) => ({
      key: photoKey('place', p.id),
      id: p.id,
      type: 'place' as const,
      name: p.name,
    }));
    const all = [...landmarks, ...places];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }, [language, query]);

  const addPhoto = useCallback(
    async (row: Row) => {
      const existing = photos[row.key] ?? [];
      if (existing.length >= MAX_PHOTOS_PER_PLACE) {
        Alert.alert(t('admin.photoLimitTitle'), t('admin.photoLimitBody'));
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('review.permTitle'), t('review.permLibrary'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      });
      if (result.canceled || !result.assets[0]?.base64) return;

      setBusyKey(row.key);
      const ok = await uploadPlacePhoto(
        row.type,
        row.id,
        result.assets[0].base64,
        result.assets[0].mimeType,
      );
      setBusyKey(null);
      if (!ok) {
        Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
        return;
      }
      await load();
    },
    [load, photos, t],
  );

  const removePhoto = useCallback(
    (photo: PlacePhoto) => {
      Alert.alert(t('admin.deleteTitle'), t('admin.deleteBody'), [
        { text: t('admin.cancel'), style: 'cancel' },
        {
          text: t('admin.delete'),
          style: 'destructive',
          onPress: async () => {
            const ok = await deletePlacePhoto(photo.id, photo.url);
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
      data={rows}
      keyExtractor={(row) => row.key}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <TextInput
          style={[s.input, { marginBottom: 8 }]}
          value={query}
          placeholder={t('admin.searchPlaces')}
          placeholderTextColor={colors.textMuted}
          onChangeText={setQuery}
        />
      }
      ListEmptyComponent={<Text style={s.empty}>{t('admin.noResults')}</Text>}
      renderItem={({ item }) => {
        const current = photos[item.key] ?? [];
        return (
          <View style={s.card}>
            <Text style={s.cardTitle}>{item.name}</Text>
            <Text style={s.cardMeta}>
              {item.type === 'landmark' ? t('admin.typeLandmark') : t('admin.typePlace')} ·{' '}
              {current.length}/{MAX_PHOTOS_PER_PLACE}
            </Text>
            {current.length > 0 && (
              <View style={s.row}>
                {current.map((photo) => (
                  <View key={photo.id} style={{ flex: 1 }}>
                    <Image
                      source={{ uri: photo.url }}
                      style={{ width: '100%', height: 90, borderRadius: 8 }}
                      contentFit="cover"
                    />
                    <Pressable
                      style={[s.button, s.buttonDanger, { marginTop: 4 }]}
                      onPress={() => removePhoto(photo)}
                    >
                      <Ionicons name="trash" size={14} color={colors.white} />
                      <Text style={s.buttonText}>{t('admin.delete')}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            {current.length < MAX_PHOTOS_PER_PLACE && (
              <Pressable
                style={[s.button, s.buttonPrimary]}
                disabled={busyKey === item.key}
                onPress={() => void addPhoto(item)}
              >
                {busyKey === item.key ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="image" size={16} color={colors.white} />
                    <Text style={s.buttonText}>{t('admin.addPhoto')}</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        );
      }}
    />
  );
}
