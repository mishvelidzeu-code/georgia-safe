import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { deleteAdminListing, setAdminListingStatus, updateAdminListing } from '../../lib/admin';
import { supabase } from '../../lib/supabase';
import type { ListingStatus, PartnerListing } from '../../lib/rentals';
import CitySelect from '../CitySelect';
import ListingLocationPicker from '../ListingLocationPicker';
import PhotoReorderRow from '../PhotoReorderRow';

type Props = {
  listing: PartnerListing;
  onSaved: () => void;
};

type Field = 'title' | 'description' | 'workingHours' | 'priceDescription' | 'phone';

const FIELDS: { key: Field; labelKey: string; multiline?: boolean }[] = [
  { key: 'title', labelKey: 'partnerListings.name' },
  { key: 'description', labelKey: 'rentals.descriptionField', multiline: true },
  { key: 'workingHours', labelKey: 'partnerListings.hours' },
  { key: 'priceDescription', labelKey: 'partnerListings.price' },
  { key: 'phone', labelKey: 'partnerListings.field.phone' },
];

function publicUrl(path: string): string {
  return supabase ? supabase.storage.from('partner-cars').getPublicUrl(path).data.publicUrl : path;
}

/**
 * Edit a partner listing from its pin: text fields, the city from the list,
 * the location by map pin (never a typed address), the photo order, its
 * status, or delete it. WhatsApp always follows the phone number.
 */
export default function AdminListingEditor({ listing, onSaved }: Props) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<Record<Field, string>>({
    title: listing.title,
    description: listing.description ?? '',
    workingHours: listing.workingHours ?? '',
    priceDescription: listing.priceDescription ?? '',
    phone: listing.phone ?? '',
  });
  const [city, setCity] = useState(listing.city);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; address: string | null }>({
    latitude: listing.latitude ?? 0,
    longitude: listing.longitude ?? 0,
    address: listing.address,
  });
  const hasPin = listing.latitude !== null && listing.longitude !== null;
  const [pinSet, setPinSet] = useState(hasPin);
  const [photoPaths, setPhotoPaths] = useState(listing.photoPaths);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fail = useCallback(() => Alert.alert(t('admin.errorTitle'), t('admin.errorBody')), [t]);
  const optional = (value: string) => value.trim() || null;

  const save = useCallback(async () => {
    if (!draft.title.trim() || !city.trim()) {
      Alert.alert(t('admin.invalidTitle'), t('partnerListings.required'));
      return;
    }
    if (!pinSet) {
      setPickerOpen(true);
      Alert.alert(t('admin.invalidTitle'), t('partnerListings.locationRequired'));
      return;
    }
    setBusy(true);
    const phone = optional(draft.phone);
    const ok = await updateAdminListing(listing.id, {
      title: draft.title.trim(),
      city: city.trim(),
      address: location.address,
      description: optional(draft.description),
      workingHours: optional(draft.workingHours),
      priceDescription: optional(draft.priceDescription),
      phone,
      whatsapp: phone,
      latitude: location.latitude,
      longitude: location.longitude,
      photoPaths,
    });
    setBusy(false);
    ok ? onSaved() : fail();
  }, [city, draft, fail, listing.id, location, onSaved, photoPaths, pinSet, t]);

  const setStatus = useCallback(async (status: ListingStatus) => {
    setBusy(true);
    const ok = await setAdminListingStatus(listing.id, status, undefined, listing.reviewStatus === 'pending');
    setBusy(false);
    ok ? onSaved() : fail();
  }, [fail, listing.id, listing.reviewStatus, onSaved]);

  const confirmDelete = useCallback(() => {
    Alert.alert(t('admin.deleteTitle'), listing.title, [
      { text: t('admin.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const ok = await deleteAdminListing(listing.id);
          setBusy(false);
          ok ? onSaved() : fail();
        },
      },
    ]);
  }, [fail, listing.id, listing.title, onSaved, t]);

  return (
    <View style={s.card}>
      <Text style={s.cardMeta}>
        {t(`partnerListings.category.${listing.category}`)}
        {listing.companyName ? ` · ${listing.companyName}` : ''} · {t(`partnerListings.${listing.reviewStatus ?? listing.status}`)}
      </Text>
      {FIELDS.map(({ key, labelKey, multiline }) => (
        <View key={key} style={{ gap: 4 }}>
          <Text style={s.label}>{t(labelKey)}</Text>
          <TextInput
            style={[s.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
            value={draft[key]}
            multiline={multiline}
            onChangeText={(value) => setDraft((current) => ({ ...current, [key]: value }))}
            placeholderTextColor={colors.textMuted}
          />
        </View>
      ))}
      <View style={{ gap: 4 }}>
        <Text style={s.label}>{t('rentals.cityField')}</Text>
        <CitySelect value={city || null} onChange={(next) => setCity(next ?? '')} />
      </View>
      <Pressable style={[s.button, pinSet ? s.buttonPrimary : s.buttonNeutral, { justifyContent: 'flex-start' }]} onPress={() => setPickerOpen(true)}>
        <Ionicons name={pinSet ? 'location' : 'location-outline'} size={16} color={colors.white} />
        <Text style={s.buttonText} numberOfLines={1}>
          {pinSet
            ? location.address || `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
            : t('partnerListings.chooseOnMap')}
        </Text>
      </Pressable>
      {photoPaths.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={s.label}>{t('admin.tab_photos')}</Text>
          <PhotoReorderRow photos={photoPaths} uriOf={publicUrl} onChange={setPhotoPaths} />
        </View>
      )}
      <Pressable style={[s.button, s.buttonPrimary]} disabled={busy} onPress={() => void save()}>
        <Ionicons name="save" size={16} color={colors.white} />
        <Text style={s.buttonText}>{t('admin.save')}</Text>
      </Pressable>
      <View style={s.row}>
        {(listing.reviewStatus === 'pending' || listing.status !== 'published') && (
          <Pressable style={[s.button, s.buttonPrimary]} disabled={busy} onPress={() => void setStatus('published')}>
            <Text style={s.buttonText}>{t('admin.approve')}</Text>
          </Pressable>
        )}
        <Pressable style={[s.button, s.buttonNeutral]} disabled={busy} onPress={() => void setStatus('hidden')}>
          <Text style={s.buttonText}>{t('partnerListings.hide')}</Text>
        </Pressable>
        <Pressable style={[s.button, s.buttonNeutral]} disabled={busy} onPress={() => void setStatus('rejected')}>
          <Text style={s.buttonText}>{t('partnerListings.reject')}</Text>
        </Pressable>
      </View>
      <Pressable style={[s.button, s.buttonDanger]} disabled={busy} onPress={confirmDelete}>
        <Ionicons name="trash" size={16} color={colors.white} />
        <Text style={s.buttonText}>{t('admin.delete')}</Text>
      </Pressable>

      <ListingLocationPicker
        visible={pickerOpen}
        city={city}
        initial={pinSet ? { latitude: location.latitude, longitude: location.longitude } : null}
        onClose={() => setPickerOpen(false)}
        onSelect={(coordinate, address) => {
          setLocation({ ...coordinate, address });
          setPinSet(true);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}
