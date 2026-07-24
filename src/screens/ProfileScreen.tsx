import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import emergencyData from '../data/emergency.json';
import CountryPickerModal from '../components/CountryPickerModal';
import {
  getSelectedCountryId,
  setSelectedCountryId,
  getTrustedContact,
  setTrustedContact,
} from '../lib/storage';
import { useLanguage } from '../i18n/LanguageContext';
import type { LanguageCode } from '../i18n/LanguageContext';
import { startTestLiveActivity, stopTestLiveActivity } from '../lib/liveActivity';
import CheckInTimer from '../components/CheckInTimer';
import FakeCallButton from '../components/FakeCallButton';
import { fetchEmergency } from '../lib/remoteData';
import type { EmergencyData } from '../lib/remoteData';
import { useRemoteData } from '../lib/useRemoteData';

const LANGUAGES: LanguageCode[] = ['en', 'ka', 'ru'];
const LANGUAGE_NAMES: Record<LanguageCode, string> = { en: 'English', ka: 'ქართული', ru: 'Русский' };

export default function ProfileScreen() {
  const { t, language, setLanguage } = useLanguage();
  const emergency = useRemoteData(emergencyData as EmergencyData, fetchEmergency);
  const [selectedCountryId, setSelectedCountryIdState] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [savedMessageVisible, setSavedMessageVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getSelectedCountryId().then(setSelectedCountryIdState);
    getTrustedContact().then((contact) => {
      if (contact) {
        setContactName(contact.name);
        setContactPhone(contact.phone);
      }
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Re-read stored values in case they changed elsewhere (e.g. the
    // Emergency tab shares the same selected-country storage key).
    const [countryId, contact] = await Promise.all([
      getSelectedCountryId(),
      getTrustedContact(),
    ]);
    setSelectedCountryIdState(countryId);
    if (contact) {
      setContactName(contact.name);
      setContactPhone(contact.phone);
    }
    setRefreshing(false);
  }, []);

  const selectedCountry =
    emergency.embassies.find((embassy) => embassy.id === selectedCountryId) ?? null;

  async function handleSelectCountry(id: string) {
    setSelectedCountryIdState(id);
    setPickerVisible(false);
    await setSelectedCountryId(id);
  }

  async function handleSaveContact() {
    await setTrustedContact({ name: contactName, phone: contactPhone });
    setSavedMessageVisible(true);
    setTimeout(() => setSavedMessageVisible(false), 2000);
  }

  function handleStartLiveActivity() {
    startTestLiveActivity(t('liveActivity.activeTitle'), t('liveActivity.activeSubtitle'));
  }

  function handleStopLiveActivity() {
    stopTestLiveActivity(t('liveActivity.activeTitle'), t('liveActivity.endedSubtitle'));
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.safe} />
      }
    >
      <Text style={styles.sectionTitle}>{t('profile.title')}</Text>

      <Text style={styles.label}>{t('profile.language')}</Text>
      <View style={styles.languageRow}>
        {LANGUAGES.map((code) => (
          <Pressable
            key={code}
            style={[styles.languageButton, language === code && styles.languageButtonActive]}
            onPress={() => setLanguage(code)}
          >
            <Text
              style={[
                styles.languageButtonText,
                language === code && styles.languageButtonTextActive,
              ]}
            >
              {LANGUAGE_NAMES[code]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('profile.nationality')}</Text>
      <Pressable style={styles.card} onPress={() => setPickerVisible(true)}>
        <Text style={styles.countryValue}>
          {selectedCountry ? selectedCountry.country_en : t('common.selectCountry')}
        </Text>
      </Pressable>

      <Text style={styles.label}>{t('profile.trustedContact')}</Text>
      <View style={styles.card}>
        <Text style={styles.inputLabel}>{t('profile.name')}</Text>
        <TextInput
          style={styles.input}
          value={contactName}
          onChangeText={setContactName}
          placeholder={t('profile.namePlaceholder')}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.inputLabel}>{t('profile.phoneNumber')}</Text>
        <TextInput
          style={styles.input}
          value={contactPhone}
          onChangeText={setContactPhone}
          placeholder={t('profile.phonePlaceholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
        />
        <Pressable style={styles.saveButton} onPress={handleSaveContact}>
          <Text style={styles.saveButtonText}>
            {savedMessageVisible ? t('common.saved') : t('common.save')}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>{t('checkIn.title')}</Text>
      <CheckInTimer />

      <Text style={styles.label}>{t('fakeCall.title')}</Text>
      <FakeCallButton />

      <Text style={styles.label}>{t('liveActivity.testLabel')}</Text>
      <View style={styles.card}>
        <Text style={styles.testHint}>{t('liveActivity.testHint')}</Text>
        <View style={styles.testRow}>
          <Pressable style={styles.testButton} onPress={handleStartLiveActivity}>
            <Text style={styles.testButtonText}>{t('liveActivity.start')}</Text>
          </Pressable>
          <Pressable
            style={[styles.testButton, styles.testButtonStop]}
            onPress={handleStopLiveActivity}
          >
            <Text style={styles.testButtonText}>{t('liveActivity.stop')}</Text>
          </Pressable>
        </View>
      </View>

      <CountryPickerModal
        visible={pickerVisible}
        embassies={emergency.embassies}
        onClose={() => setPickerVisible(false)}
        onSelect={handleSelectCountry}
      />
    </ScrollView>
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
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  languageRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  languageButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  languageButtonActive: {
    backgroundColor: colors.safe,
    borderColor: colors.safe,
  },
  languageButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  languageButtonTextActive: {
    color: colors.background,
  },
  countryValue: {
    color: colors.text,
    fontSize: 16,
  },
  inputLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: colors.safe,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  testHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  testRow: {
    flexDirection: 'row',
    gap: 10,
  },
  testButton: {
    flex: 1,
    backgroundColor: colors.safe,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  testButtonStop: {
    backgroundColor: colors.risk,
  },
  testButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
});
