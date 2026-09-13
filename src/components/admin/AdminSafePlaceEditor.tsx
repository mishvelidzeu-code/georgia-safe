import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { deleteSafePlace, upsertSafePlace } from '../../lib/admin';
import type { SafePlace, SafePlaceType } from '../../lib/remoteData';
import PlacePhotosEditor from './PlacePhotosEditor';

const TYPES: SafePlaceType[] = ['pharmacy24', 'atm', 'hospital', 'police', 'toilet'];

type Props = {
  place: SafePlace;
  onSaved: () => void;
  onPhotosChanged: () => void;
};

/** Edit or delete one curated safe place (pharmacy, ATM, hospital…) from its pin. */
export default function AdminSafePlaceEditor({ place, onSaved, onPhotosChanged }: Props) {
  const { t } = useLanguage();
  const [name, setName] = useState(place.name);
  const [type, setType] = useState<SafePlaceType>(place.type);
  const [address, setAddress] = useState(place.address);
  const [lat, setLat] = useState(String(place.lat));
  const [lng, setLng] = useState(String(place.lng));
  const [open24h, setOpen24h] = useState(place.open_24h);
  const [busy, setBusy] = useState(false);

  const fail = useCallback(() => Alert.alert(t('admin.errorTitle'), t('admin.errorBody')), [t]);

  const save = useCallback(async () => {
    const parsedLat = Number(lat.replace(',', '.'));
    const parsedLng = Number(lng.replace(',', '.'));
    // Same Georgia bounding box as the admin panel's form.
    const valid = name.trim() && Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
      && parsedLat > 41 && parsedLat < 44 && parsedLng > 39 && parsedLng < 47;
    if (!valid) {
      Alert.alert(t('admin.invalidTitle'), t('admin.invalidBody'));
      return;
    }
    setBusy(true);
    const ok = await upsertSafePlace({ id: place.id, name, type, address, lat: parsedLat, lng: parsedLng, open_24h: open24h });
    setBusy(false);
    ok ? onSaved() : fail();
  }, [address, fail, lat, lng, name, onSaved, open24h, place.id, t, type]);

  const confirmDelete = useCallback(() => {
    Alert.alert(t('admin.deleteTitle'), place.name, [
      { text: t('admin.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const ok = await deleteSafePlace(place.id);
          setBusy(false);
          ok ? onSaved() : fail();
        },
      },
    ]);
  }, [fail, onSaved, place.id, place.name, t]);

  return (
    <>
      <View style={s.card}>
        <Text style={s.cardMeta}>{t('admin.fieldId')}: {place.id}</Text>
        <Text style={s.label}>{t('admin.fieldName')}</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={colors.textMuted} />
        <Text style={s.label}>{t('admin.fieldType')}</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {TYPES.map((item) => (
            <Pressable key={item} style={[s.chip, type === item && s.chipActive]} onPress={() => setType(item)}>
              <Text style={[s.chipText, type === item && s.chipTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>{t('admin.fieldAddress')}</Text>
        <TextInput style={s.input} value={address} onChangeText={setAddress} placeholderTextColor={colors.textMuted} />
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
        <Pressable style={[s.chip, open24h && s.chipActive, { alignSelf: 'flex-start' }]} onPress={() => setOpen24h((value) => !value)}>
          <Text style={[s.chipText, open24h && s.chipTextActive]}>{t('admin.field24h')}</Text>
        </Pressable>
        <View style={s.row}>
          <Pressable style={[s.button, s.buttonPrimary]} disabled={busy} onPress={() => void save()}>
            <Ionicons name="save" size={16} color={colors.white} />
            <Text style={s.buttonText}>{t('admin.save')}</Text>
          </Pressable>
          <Pressable style={[s.button, s.buttonDanger]} disabled={busy} onPress={confirmDelete}>
            <Ionicons name="trash" size={16} color={colors.white} />
            <Text style={s.buttonText}>{t('admin.delete')}</Text>
          </Pressable>
        </View>
      </View>
      <PlacePhotosEditor placeType="place" placeId={place.id} onChanged={onPhotosChanged} />
    </>
  );
}
