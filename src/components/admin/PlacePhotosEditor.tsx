import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  MAX_PHOTOS_PER_PLACE,
  deletePlacePhoto,
  fetchPlacePhotos,
  photoKey,
  uploadPlacePhoto,
} from '../../lib/placePhotos';
import type { PlacePhoto, PlacePhotoType } from '../../lib/placePhotos';

type Props = {
  placeType: PlacePhotoType;
  placeId: string;
  /** Called after an upload or removal so the map can refresh its photo cache. */
  onChanged: () => void;
};

/** The curated-photo controls for one landmark or safe place. */
export default function PlacePhotosEditor({ placeType, placeId, onChanged }: Props) {
  const { t } = useLanguage();
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchPlacePhotos();
      setPhotos(all[photoKey(placeType, placeId)] ?? []);
    } catch {
      setPhotos([]);
    }
    setLoading(false);
  }, [placeType, placeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addPhoto = useCallback(async () => {
    if (photos.length >= MAX_PHOTOS_PER_PLACE) {
      Alert.alert(t('admin.photoLimitTitle'), t('admin.photoLimitBody'));
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('review.permTitle'), t('review.permLibrary'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    setBusy(true);
    const ok = await uploadPlacePhoto(placeType, placeId, result.assets[0].base64, result.assets[0].mimeType);
    setBusy(false);
    if (!ok) {
      Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
      return;
    }
    await load();
    onChanged();
  }, [load, onChanged, photos.length, placeId, placeType, t]);

  const removePhoto = useCallback((photo: PlacePhoto) => {
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
          onChanged();
        },
      },
    ]);
  }, [load, onChanged, t]);

  if (loading) return <ActivityIndicator color={colors.text} />;

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{t('admin.tab_photos')}</Text>
      <Text style={s.cardMeta}>{photos.length}/{MAX_PHOTOS_PER_PLACE}</Text>
      {photos.length > 0 && (
        <View style={s.row}>
          {photos.map((photo) => (
            <View key={photo.id} style={{ flex: 1 }}>
              <Image source={{ uri: photo.url }} style={{ width: '100%', height: 90, borderRadius: 8 }} contentFit="cover" />
              <Pressable style={[s.button, s.buttonDanger, { marginTop: 4 }]} onPress={() => removePhoto(photo)}>
                <Ionicons name="trash" size={14} color={colors.white} />
                <Text style={s.buttonText}>{t('admin.delete')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {photos.length < MAX_PHOTOS_PER_PLACE && (
        <Pressable style={[s.button, s.buttonPrimary]} disabled={busy} onPress={() => void addPhoto()}>
          {busy ? <ActivityIndicator size="small" color={colors.white} /> : (
            <>
              <Ionicons name="image" size={16} color={colors.white} />
              <Text style={s.buttonText}>{t('admin.addPhoto')}</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}
