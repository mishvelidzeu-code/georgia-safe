import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { reverseGeocodeListing } from '../lib/listingLocation';
import { isInsideGeorgia } from '../lib/geography';

type Coordinate = { latitude: number; longitude: number };

type Props = {
  visible: boolean;
  city: string;
  initial: Coordinate | null;
  onClose: () => void;
  /** The pin, plus the street address the OS geocoder found for it (if any). */
  onSelect: (coordinate: Coordinate, address: string | null) => void;
};

const MIN_TOP_INSET = 24;

/**
 * Full-screen map for placing a listing's pin. The address is never typed:
 * the partner taps the map (or "use my location") and the address is read
 * back from the pin, so what tourists see is exactly where the pin sits.
 */
export default function ListingLocationPicker({ visible, city, initial, onClose, onSelect }: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState<Coordinate | null>(initial);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const mapRef = useRef<MapView>(null);
  useEffect(() => { if (visible) setPin(initial); }, [visible, initial]);

  async function useMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('denied');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      if (!isInsideGeorgia(coordinate.latitude, coordinate.longitude)) throw new Error('abroad');
      setPin(coordinate);
      mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 350);
    } catch {
      Alert.alert(t('partnerListings.locationNotFoundTitle'), t('partnerListings.myLocationFailed'));
    } finally {
      setLocating(false);
    }
  }

  async function confirm() {
    if (!pin) return;
    setConfirming(true);
    const address = await reverseGeocodeListing(pin);
    setConfirming(false);
    onSelect(pin, address);
  }

  const region = pin
    ? { ...pin, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: 41.7151, longitude: 44.783, latitudeDelta: 0.16, longitudeDelta: 0.16 };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Insets from the hook: safe-area-context's SafeAreaView gets none inside a RN Modal. */}
      <View style={s.container}>
        <View style={[s.header, { paddingTop: Math.max(insets.top, MIN_TOP_INSET) + 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{t('partnerListings.mapLocation')}</Text>
            <Text style={s.subtitle}>{city}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={26} color={colors.text} /></Pressable>
        </View>
        <MapView
          ref={mapRef}
          style={s.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={region}
          showsUserLocation
          onPress={(e) => setPin(e.nativeEvent.coordinate)}
        >
          {pin && <Marker coordinate={pin} draggable onDragEnd={(e) => setPin(e.nativeEvent.coordinate)} />}
        </MapView>
        <Pressable style={s.myLocation} onPress={() => void useMyLocation()} disabled={locating} accessibilityRole="button">
          {locating ? <ActivityIndicator color={colors.white} /> : <Ionicons name="locate" size={22} color={colors.white} />}
        </Pressable>
        <Text style={s.hint}>{t('partnerListings.mapHint')}</Text>
        <View style={[s.actions, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={s.secondary} onPress={() => void useMyLocation()} disabled={locating}>
            <Ionicons name="navigate" size={16} color={colors.text} />
            <Text style={s.secondaryText}>{t('partnerListings.myLocation')}</Text>
          </Pressable>
          <Pressable style={[s.primary, !pin && { opacity: 0.5 }]} disabled={!pin || confirming} onPress={() => void confirm()}>
            {confirming ? <ActivityIndicator color={colors.white} /> : <Text style={s.primaryText}>{t('partnerListings.confirmLocation')}</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  map: { flex: 1 },
  myLocation: {
    position: 'absolute',
    right: 16,
    top: 130,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: colors.textMuted, fontSize: 13, padding: 12, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  primary: { flex: 1, backgroundColor: colors.safe, borderRadius: 10, padding: 13, alignItems: 'center' },
  secondary: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: colors.card, borderRadius: 10, padding: 13, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.white, fontWeight: '700' },
  secondaryText: { color: colors.text, fontWeight: '700' },
});
