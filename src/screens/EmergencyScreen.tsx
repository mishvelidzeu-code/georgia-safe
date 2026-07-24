import { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import emergencyData from '../data/emergency.json';
import { getSelectedCountryId, setSelectedCountryId } from '../lib/storage';
import CountryPickerModal from '../components/CountryPickerModal';
import FakeCallButton from '../components/FakeCallButton';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchEmergency } from '../lib/remoteData';
import type { EmergencyData } from '../lib/remoteData';
import { useRemoteData } from '../lib/useRemoteData';

type Phrase = {
  ka: string;
  en: string;
};

const PHRASES: Phrase[] = [
  { ka: 'დახმარება მჭირდება', en: 'I need help' },
  { ka: 'გამოიძახეთ პოლიცია', en: 'Call the police' },
  { ka: 'ექიმი მჭირდება', en: 'I need a doctor' },
  { ka: 'დამირეკეთ ტაქსი', en: 'Call me a taxi' },
];

function callNumber(phone: string) {
  // tel: calls go over the cellular voice network, not internet data, so
  // this works offline — the try/catch just guards against edge cases
  // (e.g. no SIM / airplane mode) without crashing the screen.
  Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
}

function openDirections(address: string) {
  // Opening Google Maps directions requires internet — if there's none,
  // this just silently fails instead of throwing.
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  Linking.openURL(url).catch(() => {});
}

export default function EmergencyScreen() {
  const { t } = useLanguage();
  const emergency = useRemoteData(emergencyData as EmergencyData, fetchEmergency);
  const [selectedCountryId, setSelectedCountryIdState] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [activePhrase, setActivePhrase] = useState<Phrase | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getSelectedCountryId().then(setSelectedCountryIdState);
  }, []);

  const handleSelectCountry = useCallback(async (id: string) => {
    setSelectedCountryIdState(id);
    setPickerVisible(false);
    await setSelectedCountryId(id);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Re-read the selected embassy from storage in case it changed on the
    // Profile tab, since the two screens share the same AsyncStorage key.
    const id = await getSelectedCountryId();
    setSelectedCountryIdState(id);
    setRefreshing(false);
  }, []);

  const selectedEmbassy =
    emergency.embassies.find((embassy) => embassy.id === selectedCountryId) ?? null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.safe} />
        }
      >
        <Pressable style={styles.sosButton} onPress={() => callNumber('112')}>
          <Ionicons name="call" size={28} color={colors.white} />
          <Text style={styles.sosText}>{t('emergency.call112')}</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{t('fakeCall.title')}</Text>
        <FakeCallButton />

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.rowTitle}>{t('emergency.patrolPolice')}</Text>
            <Pressable onPress={() => callNumber(emergency.police[0].phone)}>
              <Text style={styles.phoneLink}>{emergency.police[0].phone}</Text>
            </Pressable>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.rowTitle}>{t('emergency.healthHotline')}</Text>
            <Pressable onPress={() => callNumber(emergency.health_hotline.number)}>
              <Text style={styles.phoneLink}>{emergency.health_hotline.number}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('emergency.hospitals')}</Text>
        {emergency.hospitals.map((hospital) => (
          <View key={hospital.id} style={styles.card}>
            <Text style={styles.rowTitle}>{hospital.name_en}</Text>
            <Text style={styles.address}>{hospital.address}</Text>
            <View style={styles.cardActions}>
              <Pressable style={styles.actionButton} onPress={() => callNumber(hospital.phone)}>
                <Ionicons name="call" size={14} color={colors.background} />
                <Text style={styles.actionText}>{t('common.call')}</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.actionButtonSecondary]}
                onPress={() => openDirections(hospital.address)}
              >
                <Ionicons name="navigate" size={14} color={colors.text} />
                <Text style={[styles.actionText, styles.actionTextSecondary]}>
                  {t('common.directions')}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>{t('emergency.myEmbassy')}</Text>
        <View style={styles.card}>
          {selectedEmbassy ? (
            <>
              <Text style={styles.rowTitle}>{selectedEmbassy.country_en}</Text>
              <Text style={styles.address}>{selectedEmbassy.address}</Text>
              <View style={styles.cardActions}>
                <Pressable
                  style={styles.actionButton}
                  onPress={() => callNumber(selectedEmbassy.phone)}
                >
                  <Ionicons name="call" size={14} color={colors.background} />
                  <Text style={styles.actionText}>{t('common.call')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.actionButtonSecondary]}
                  onPress={() => setPickerVisible(true)}
                >
                  <Text style={[styles.actionText, styles.actionTextSecondary]}>
                    {t('common.change')}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable style={styles.selectCountryButton} onPress={() => setPickerVisible(true)}>
              <Text style={styles.selectCountryText}>{t('common.selectCountry')}</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('emergency.showToLocal')}</Text>
        <View style={styles.phraseGrid}>
          {PHRASES.map((phrase) => (
            <Pressable
              key={phrase.ka}
              style={styles.phraseCard}
              onPress={() => setActivePhrase(phrase)}
            >
              <Text style={styles.phraseKa}>{phrase.ka}</Text>
              <Text style={styles.phraseEn}>{phrase.en}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <CountryPickerModal
        visible={pickerVisible}
        embassies={emergency.embassies}
        onClose={() => setPickerVisible(false)}
        onSelect={handleSelectCountry}
      />

      <Modal visible={activePhrase !== null} animationType="fade" transparent>
        <Pressable style={styles.phraseOverlay} onPress={() => setActivePhrase(null)}>
          <Text style={styles.phraseFullKa}>{activePhrase?.ka}</Text>
          <Text style={styles.phraseFullEn}>{activePhrase?.en}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sosButton: {
    backgroundColor: colors.risk,
    borderRadius: 16,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  sosText: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  phoneLink: {
    color: colors.safe,
    fontSize: 15,
    fontWeight: '700',
  },
  address: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 10,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.safe,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  actionButtonSecondary: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '700',
  },
  actionTextSecondary: {
    color: colors.text,
  },
  selectCountryButton: {
    backgroundColor: colors.safe,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  selectCountryText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  phraseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  phraseCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    width: '47%',
  },
  phraseKa: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  phraseEn: {
    color: colors.textMuted,
    fontSize: 12,
  },
  phraseOverlay: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  phraseFullKa: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  phraseFullEn: {
    color: colors.textMuted,
    fontSize: 20,
    textAlign: 'center',
  },
});
