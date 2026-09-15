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
import { findCountry, countryName } from '../lib/countries';
import {
  getSelectedCountryId,
  setSelectedCountryId,
  getTrustedContact,
  setTrustedContact,
} from '../lib/storage';
import { useLanguage } from '../i18n/LanguageContext';
import type { LanguageCode } from '../i18n/LanguageContext';
import FakeCallButton from '../components/FakeCallButton';
import CollapsibleSection from '../components/CollapsibleSection';
import { fetchEmergency } from '../lib/remoteData';
import type { EmergencyData } from '../lib/remoteData';
import { useRemoteData } from '../lib/useRemoteData';
import { usePremium } from '../premium/PremiumContext';
import { restore, requestRefund, FREE_MESSAGE_LIMIT, PLAN_NAME_KEYS, isAutoRenewing } from '../lib/premium';
import { APPLE_REPORT_PROBLEM_URL, MANAGE_SUBSCRIPTIONS_URL, PRIVACY_POLICY_URL, openLegalUrl } from '../lib/legal';
import { deleteAccount } from '../lib/account';
import { useLegalTerms } from '../legal/LegalTermsContext';

const LANGUAGES: LanguageCode[] = ['en', 'ka', 'ru'];
const LANGUAGE_NAMES: Record<LanguageCode, string> = { en: 'English', ka: 'ქართული', ru: 'Русский' };

export default function ProfileScreen() {
  const { t, language, setLanguage } = useLanguage();
  const { openTerms } = useLegalTerms();
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
  // Cancelling a pass means asking Apple for the money back — there is nothing
  // else to cancel on a one-time purchase. The refund itself is Apple's call.
  const confirmRefund = useCallback(() => {
    if (!entitlement) return;
    Alert.alert(t('premium.refundTitle'), t('premium.refundBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('premium.cancelPlan'),
        style: 'destructive',
        onPress: async () => {
          const outcome = await requestRefund(entitlement.plan);
          if (outcome === 'sent') Alert.alert(t('premium.refundSentTitle'), t('premium.refundSentBody'));
          else if (outcome === 'unavailable') {
            Alert.alert(t('premium.refundUnavailableTitle'), t('premium.refundUnavailableBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: 'OK', onPress: () => openLegalUrl(APPLE_REPORT_PROBLEM_URL) },
            ]);
          }
        },
      },
    ]);
  }, [entitlement, t]);

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

  // The administrator should never have to hunt for a hidden button after
  // signing in. Opening Profile with the authorised account goes straight to
  // the panel; server-side RLS remains the real access control.
  useEffect(() => {
    if (isAdminEmail(session?.user?.email)) setAdminVisible(true);
  }, [session?.user?.id, session?.user?.email]);

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.safe} />
      }
    >
      <Text style={styles.sectionTitle}>{t('profile.title')}</Text>

      {/* Each setting folds to a one-line header with its current value, so
          the whole profile reads as a short list until something is tapped. */}
      <CollapsibleSection title={t('profile.language')} summary={LANGUAGE_NAMES[language]}>
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
      </CollapsibleSection>

      <CollapsibleSection
        title={t('profile.nationality')}
        summary={selectedCountry ? countryName(selectedCountry, language) : t('common.selectCountry')}
      >
      <Pressable style={styles.card} onPress={() => setPickerVisible(true)}>
        <Text style={styles.countryValue}>
          {selectedCountry ? countryName(selectedCountry, language) : t('common.selectCountry')}
        </Text>
        {selectedCountry && !selectedCountry.embassyId && (
          <Text style={styles.countryNote}>{t('common.noEmbassy')}</Text>
        )}
      </Pressable>
      </CollapsibleSection>

      <CollapsibleSection title={t('profile.trustedContact')} summary={contactName || undefined}>
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
      </CollapsibleSection>

      <CollapsibleSection title={t('fakeCall.title')}>
        <FakeCallButton />
      </CollapsibleSection>

      <CollapsibleSection
        title={t('profile.subscription')}
        summary={premium && entitlement ? t('premium.statusActive') : t('premium.statusFree')}
      >
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
            <Pressable style={styles.upgradeButton} onPress={() => showPaywall('general')}>
              <Ionicons name="add-circle" size={18} color={colors.white} />
              <Text style={styles.upgradeButtonText}>{t('premium.extend')}</Text>
            </Pressable>
            {isAutoRenewing(entitlement.plan) && (
              <Pressable
                style={styles.premiumLink}
                onPress={() => openLegalUrl(MANAGE_SUBSCRIPTIONS_URL)}
              >
                <Ionicons name="open-outline" size={16} color={colors.text} />
                <Text style={styles.premiumLinkText}>{t('premium.manage')}</Text>
              </Pressable>
            )}
            <Pressable style={styles.premiumLink} onPress={confirmRefund}>
              <Ionicons name="close-circle-outline" size={16} color={colors.risk} />
              <Text style={styles.premiumCancelText}>{t('premium.cancelPlan')}</Text>
            </Pressable>
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
        <Pressable style={styles.premiumLink} onPress={openTerms}>
          <Ionicons name="document-text-outline" size={16} color={colors.textMuted} />
          <Text style={styles.premiumRestoreText}>{t('premium.terms')}</Text>
        </Pressable>
      </View>
      </CollapsibleSection>

      <CollapsibleSection
        title={t('profile.account')}
        summary={guest ? t('guest.profileStatus') : session?.user?.email ?? undefined}
      >
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
        </View>
      )}
      </CollapsibleSection>

      {/* Admin entry point. Hidden for every other account — and the panel's
          own queries are rejected server-side by RLS regardless, so hiding it
          is convenience, not the security boundary. */}
      {isAdminEmail(session?.user?.email) && (
        <CollapsibleSection title={t('admin.title')}>
          <Pressable style={styles.adminButton} onPress={() => setAdminVisible(true)}>
            <Ionicons name="construct" size={18} color={colors.white} />
            <Text style={styles.adminButtonText}>{t('admin.open')}</Text>
          </Pressable>
        </CollapsibleSection>
      )}

      {/* Sign out stays outside the folds — it should never take two taps to
          find. Deleting is last, deliberately: irreversible, so it should take
          a scroll to reach. Both hidden in guest mode — there is no account. */}
      {!guest && (
        <>
          <Pressable style={styles.signOutButton} onPress={confirmSignOut}>
            <Ionicons name="log-out-outline" size={18} color={colors.risk} />
            <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
          </Pressable>

          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>{t('profile.deleteAccount')}</Text>
            <Text style={styles.dangerHint}>{t('profile.deleteHint')}</Text>
            <Pressable
              style={[styles.deleteAccountButton, deleting && styles.deleteAccountButtonBusy]}
              disabled={deleting}
              onPress={confirmDeleteAccount}
            >
              <Ionicons name="trash-outline" size={16} color={colors.white} />
              <Text style={styles.deleteAccountText}>
                {deleting ? t('profile.deleting') : t('profile.deleteAccount')}
              </Text>
            </Pressable>
          </View>
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
    marginBottom: 12,
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
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
  premiumCancelText: {
    color: colors.risk,
    fontSize: 14,
    fontWeight: '600',
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
  dangerCard: {
    borderWidth: 1,
    borderColor: colors.risk,
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
    gap: 8,
  },
  dangerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  dangerHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.risk,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
  },
  deleteAccountButtonBusy: { opacity: 0.6 },
  deleteAccountText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.risk,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
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
});
