import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';
import emergencyData from '../data/emergency.json';
import CountryPickerModal from '../components/CountryPickerModal';
import AdminPanel from '../components/admin/AdminPanel';
import { isAdminEmail } from '../lib/admin';
import PartnerDashboard from '../components/PartnerDashboard';
import { fetchMyPartner } from '../lib/rentals';
import type { Partner } from '../lib/rentals';
import { findCountry, countryName } from '../lib/countries';
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
import { usePremium } from '../premium/PremiumContext';
import { restore, FREE_MESSAGE_LIMIT, PLAN_NAME_KEYS, isAutoRenewing } from '../lib/premium';
import { MANAGE_SUBSCRIPTIONS_URL, PRIVACY_POLICY_URL, openLegalUrl } from '../lib/legal';
import { deleteAccount } from '../lib/account';

const LANGUAGES: LanguageCode[] = ['en', 'ka', 'ru'];
const LANGUAGE_NAMES: Record<LanguageCode, string> = { en: 'English', ka: 'ქართული', ru: 'Русский' };

export default function ProfileScreen() {
  const { t, language, setLanguage } = useLanguage();
  const { session, signOut, guest, leaveGuest } = useAuth();

  const [deleting, setDeleting] = useState(false);

  // Two prompts, not one. Deleting is irreversible and sits a few millimetres
  // from "Sign out", so a single mis-tap must not be able to end an account.
  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(t('profile.deleteTitle'), t('profile.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('profile.deleteFinalTitle'), t('profile.deleteFinalBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('profile.deleteConfirm'),
              style: 'destructive',
              onPress: async () => {
                setDeleting(true);
                const result = await deleteAccount();
                setDeleting(false);
                if (!result.ok) {
                  Alert.alert(t('profile.deleteFailedTitle'), t('profile.deleteFailedBody'));
                  return;
                }
                // The account is gone server-side; signing out clears the local
                // session and sends them back to the welcome screen.
                await signOut();
              },
            },
          ]);
        },
      },
    ]);
  }, [t, signOut]);

  const confirmSignOut = useCallback(() => {
    Alert.alert(t('profile.signOutConfirmTitle'), t('profile.signOutConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOutConfirm'), style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [t, signOut]);

  const { premium, entitlement, freeRemaining, showPaywall, refreshAfterPurchase } = usePremium();
  const [restoring, setRestoring] = useState(false);

  // Apple expects a way to restore and to manage a subscription from inside the
  // app, not only from the screen that sold it.
  const handleRestore = useCallback(async () => {
    setRestoring(true);
    await restore();
    await refreshAfterPurchase();
    setRestoring(false);
  }, [refreshAfterPurchase]);

  const emergency = useRemoteData(emergencyData as EmergencyData, fetchEmergency);
  const [selectedCountryId, setSelectedCountryIdState] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [adminVisible, setAdminVisible] = useState(false);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [partnerVisible, setPartnerVisible] = useState(false);

  // Checked once per sign-in: almost every user is a tourist with no partner
  // row, and a null result simply hides the section.
  useEffect(() => {
    let cancelled = false;
    fetchMyPartner().then((found) => {
      if (!cancelled) setPartner(found);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);
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

  const selectedCountry = findCountry(selectedCountryId);

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
          {selectedCountry ? countryName(selectedCountry, language) : t('common.selectCountry')}
        </Text>
        {selectedCountry && !selectedCountry.embassyId && (
          <Text style={styles.countryNote}>{t('common.noEmbassy')}</Text>
        )}
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

      <Text style={styles.label}>{t('profile.subscription')}</Text>
      <View style={styles.card}>
        {premium && entitlement ? (
          <>
            <Text style={styles.premiumStatus}>{t('premium.statusActive')}</Text>
            <Text style={styles.premiumDetail}>
              {`${t(PLAN_NAME_KEYS[entitlement.plan])} · ${t('premium.statusUntil').replace(
                '{date}',
                entitlement.expiresAt.toLocaleDateString(),
              )}`}
            </Text>
            {isAutoRenewing(entitlement.plan) && (
              <Pressable
                style={styles.premiumLink}
                onPress={() => openLegalUrl(MANAGE_SUBSCRIPTIONS_URL)}
              >
                <Ionicons name="open-outline" size={16} color={colors.text} />
                <Text style={styles.premiumLinkText}>{t('premium.manage')}</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Text style={styles.premiumStatus}>{t('premium.statusFree')}</Text>
            {/* A guest has no per-account counter, so quoting "5 of 5 left"
                would promise something the assistant won't give them. */}
            <Text style={styles.premiumDetail}>
              {guest
                ? t('guest.subscriptionNote')
                : t('premium.statusFreeLeft')
                    .replace('{n}', String(freeRemaining))
                    .replace('{total}', String(FREE_MESSAGE_LIMIT))}
            </Text>
            <Pressable style={styles.upgradeButton} onPress={() => showPaywall('general')}>
              <Ionicons name="sparkles" size={18} color={colors.white} />
              <Text style={styles.upgradeButtonText}>{t('premium.upgrade')}</Text>
            </Pressable>
          </>
        )}
        <Pressable style={styles.premiumLink} disabled={restoring} onPress={() => void handleRestore()}>
          <Ionicons name="refresh" size={16} color={colors.textMuted} />
          <Text style={styles.premiumRestoreText}>{t('premium.restore')}</Text>
        </Pressable>
        <Pressable style={styles.premiumLink} onPress={() => openLegalUrl(PRIVACY_POLICY_URL)}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
          <Text style={styles.premiumRestoreText}>{t('premium.privacy')}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>{t('profile.account')}</Text>
      {guest ? (
        <View style={styles.card}>
          <Text style={styles.accountEmail}>{t('guest.profileStatus')}</Text>
          <Text style={styles.premiumDetail}>{t('guest.profileBody')}</Text>
          <Pressable style={styles.upgradeButton} onPress={() => void leaveGuest()}>
            <Ionicons name="person-add" size={18} color={colors.white} />
            <Text style={styles.upgradeButtonText}>{t('guest.createAccount')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.accountEmail}>
            {session?.user?.email
              ? `${t('profile.signedInAs')} ${session.user.email}`
              : t('profile.notSignedIn')}
          </Text>
          <Pressable style={styles.signOutButton} onPress={confirmSignOut}>
            <Ionicons name="log-out-outline" size={18} color={colors.risk} />
            <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
          </Pressable>
        </View>
      )}

      {/* Rental companies only: appears once the admin has created and
          approved their partner row. Tourists never have one. */}
      {partner && (
        <>
          <Text style={styles.label}>{t('rentals.dashboard')}</Text>
          <Pressable style={styles.adminButton} onPress={() => setPartnerVisible(true)}>
            <Ionicons name="car-sport" size={18} color={colors.white} />
            <Text style={styles.adminButtonText}>{t('rentals.myCars')}</Text>
          </Pressable>
          <PartnerDashboard
            partner={partner}
            visible={partnerVisible}
            onClose={() => setPartnerVisible(false)}
          />
        </>
      )}

      {/* Admin entry point. Hidden for every other account — and the panel's
          own queries are rejected server-side by RLS regardless, so hiding it
          is convenience, not the security boundary. */}
      {isAdminEmail(session?.user?.email) && (
        <>
          <Text style={styles.label}>{t('admin.title')}</Text>
          <Pressable style={styles.adminButton} onPress={() => setAdminVisible(true)}>
            <Ionicons name="construct" size={18} color={colors.white} />
            <Text style={styles.adminButtonText}>{t('admin.open')}</Text>
          </Pressable>
        </>
      )}

      {/* Last thing on the screen, deliberately: irreversible, so it should
          take a scroll to reach rather than sit next to everyday settings.
          Hidden in guest mode — there is no account to delete. */}
      {!guest && (
        <>
          <Pressable
            style={styles.deleteAccountButton}
            disabled={deleting}
            onPress={confirmDeleteAccount}
          >
            <Ionicons name="trash-outline" size={16} color={colors.risk} />
            <Text style={styles.deleteAccountText}>
              {deleting ? t('profile.deleting') : t('profile.deleteAccount')}
            </Text>
          </Pressable>
          <Text style={styles.deleteAccountHint}>{t('profile.deleteHint')}</Text>
        </>
      )}

      <CountryPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleSelectCountry}
      />

      <AdminPanel visible={adminVisible} onClose={() => setAdminVisible(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.safe,
  },
  adminButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 16,
    // Clears the floating SOS (bottom: 92) and Guardian (bottom: 88) buttons,
    // which otherwise sit on top of whatever is last in this list.
    paddingBottom: 170,
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
  accountEmail: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 14,
  },
  premiumStatus: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  premiumDetail: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.safe,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  upgradeButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  premiumLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  premiumLinkText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  premiumRestoreText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 8,
  },
  deleteAccountText: {
    color: colors.risk,
    fontSize: 14,
    fontWeight: '600',
  },
  deleteAccountHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 24,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.risk,
    borderRadius: 12,
    paddingVertical: 12,
  },
  signOutText: {
    color: colors.risk,
    fontSize: 15,
    fontWeight: '700',
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
  countryNote: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
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
