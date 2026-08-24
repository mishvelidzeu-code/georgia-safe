import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { PurchasesPackage } from 'react-native-purchases';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { usePremium } from '../premium/PremiumContext';
import type { PaywallReason } from '../premium/PremiumContext';
import { useGuardianChat } from '../guardian/GuardianChatContext';
import {
  fetchPackages,
  isAutoRenewing,
  planForProduct,
  purchase,
  restore,
  PLAN_NAME_KEYS,
  PLAN_ORDER,
} from '../lib/premium';
import type { Plan } from '../lib/premium';
import { PRIVACY_POLICY_URL, TERMS_URL, openLegalUrl } from '../lib/legal';
import { successFeedback, errorFeedback, tapFeedback } from '../lib/haptics';

/** Features listed on the paywall. Everything else in the app stays free. */
const FEATURES = [
  'premium.featureGuardian',
  'premium.featurePoi',
  'premium.featureMark',
  'premium.featureReview',
  'premium.featurePhotos',
  'premium.featureArrivals',
];

/** Which promise the paywall leads with, decided by what the tourist just tapped. */
const HEADLINE_KEYS: Record<PaywallReason, string> = {
  guardian: 'premium.headlineGuardian',
  contribute: 'premium.headlineContribute',
  poi: 'premium.headlinePoi',
  general: 'premium.headlineGeneral',
};

const PLAN_DURATION_KEYS: Record<Plan, string> = {
  pass_5d: 'premium.duration5d',
  pass_10d: 'premium.duration10d',
  monthly: 'premium.durationMonthly',
};

/**
 * Store packages in the order the paywall should read: shortest first, the
 * auto-renewing subscription last. RevenueCat returns them in dashboard order,
 * which we don't want to depend on. Anything unrecognised goes to the end
 * rather than being hidden — a product we can't name is still a real product.
 */
function sortPackages(list: PurchasesPackage[]): PurchasesPackage[] {
  const rank = (pkg: PurchasesPackage) => {
    const plan = planForProduct(pkg.product.identifier);
    const index = plan ? PLAN_ORDER.indexOf(plan) : -1;
    return index === -1 ? PLAN_ORDER.length : index;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/**
 * The subscription page.
 *
 * Written to the requirements App Store Review applies to any screen that
 * sells a subscription (Guideline 3.1.2): every plan shows its own title,
 * exactly what it costs and how long it lasts; one-time passes are labelled as
 * not renewing while the monthly plan carries the full auto-renewal
 * disclosure; and Restore Purchases, Terms of Use and the Privacy Policy are
 * all reachable from here.
 */
export default function PaywallModal() {
  const { t } = useLanguage();
  const { paywallVisible, hidePaywall, paywallReason, refreshAfterPurchase } = usePremium();
  const { open: openChat } = useGuardianChat();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = sortPackages(await fetchPackages());
    setPackages(list);
    // Preselect the cheapest, shortest option rather than the most expensive
    // one — the tourist still has to press Continue to buy anything.
    setSelectedId(list[0]?.identifier ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!paywallVisible) return;
    void load();
  }, [paywallVisible, load]);

  const selected = packages.find((pkg) => pkg.identifier === selectedId) ?? null;

  // Going back means going back to where this was opened from. Coming from the
  // assistant, that is the conversation — which had to be closed to get here,
  // because iOS will not show two modals at once. The same restriction applies
  // on the way back, so the chat is reopened from onDismiss.
  const returnToChatRef = useRef(false);

  const leave = useCallback(() => {
    if (paywallReason !== 'guardian') {
      hidePaywall();
      return;
    }
    if (Platform.OS === 'ios') {
      returnToChatRef.current = true;
      hidePaywall();
      return;
    }
    hidePaywall();
    openChat();
  }, [paywallReason, hidePaywall, openChat]);

  const goBack = useCallback(() => {
    tapFeedback();
    leave();
  }, [leave]);

  const handleDismissed = useCallback(() => {
    if (!returnToChatRef.current) return;
    returnToChatRef.current = false;
    openChat();
  }, [openChat]);

  const buy = useCallback(async () => {
    if (!selected) return;
    tapFeedback();
    setBusy(true);
    const outcome = await purchase(selected);
    if (outcome === 'purchased') {
      // The store has the money but our database doesn't know yet — that's a
      // webhook round trip. Waiting here avoids showing a paywall to someone
      // who has just paid.
      await refreshAfterPurchase();
      successFeedback();
      // Same route back as the button: someone who paid to keep talking to the
      // assistant should land in the conversation, not on the map.
      leave();
    } else if (outcome === 'failed') {
      errorFeedback();
      Alert.alert(t('premium.failedTitle'), t('premium.failedBody'));
    }
    setBusy(false);
  }, [selected, leave, refreshAfterPurchase, t]);

  const doRestore = useCallback(async () => {
    setBusy(true);
    await restore();
    await refreshAfterPurchase();
    setBusy(false);
  }, [refreshAfterPurchase]);

  const headline = t(HEADLINE_KEYS[paywallReason]);

  return (
    <Modal
      visible={paywallVisible}
      animationType="slide"
      onRequestClose={leave}
      onDismiss={handleDismissed}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={goBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
            <Text style={styles.backText}>{t('common.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('premium.title')}</Text>
          {/* Balances the back button so the title stays centred. */}
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.headline}>{headline}</Text>

          <View style={styles.features}>
            {FEATURES.map((key) => (
              <View key={key} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.safe} />
                <Text style={styles.featureText}>{t(key)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.stillFree}>{t('premium.stillFree')}</Text>

          <Text style={styles.choosePlan}>{t('premium.choosePlan')}</Text>

          {loading ? (
            <ActivityIndicator style={styles.spinner} color={colors.text} />
          ) : packages.length === 0 ? (
            <View style={styles.unavailableBox}>
              <Text style={styles.unavailable}>{t('premium.unavailable')}</Text>
              <Pressable style={styles.retryButton} onPress={() => void load()}>
                <Text style={styles.retryText}>{t('premium.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            packages.map((pkg) => {
              const plan = planForProduct(pkg.product.identifier);
              const active = pkg.identifier === selectedId;
              return (
                <Pressable
                  key={pkg.identifier}
                  style={[styles.plan, active && styles.planActive]}
                  disabled={busy}
                  onPress={() => {
                    tapFeedback();
                    setSelectedId(pkg.identifier);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? colors.safe : colors.textMuted}
                  />
                  <View style={styles.planBody}>
                    <Text style={styles.planTitle}>
                      {plan ? t(PLAN_NAME_KEYS[plan]) : pkg.product.title}
                    </Text>
                    {plan && <Text style={styles.planDuration}>{t(PLAN_DURATION_KEYS[plan])}</Text>}
                    <Text style={styles.planNote}>
                      {plan && isAutoRenewing(plan) ? t('premium.renews') : t('premium.oneTime')}
                    </Text>
                  </View>
                  <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
                </Pressable>
              );
            })
          )}

          {selected && (
            <Pressable
              style={[styles.cta, busy && styles.ctaDisabled]}
              disabled={busy}
              onPress={() => void buy()}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.ctaText}>
                  {`${t('premium.continueButton')} — ${selected.product.priceString}`}
                </Text>
              )}
            </Pressable>
          )}

          {/* Apple requires a visible way to restore previous purchases. */}
          <Pressable style={styles.restore} disabled={busy} onPress={() => void doRestore()}>
            <Text style={styles.restoreText}>{t('premium.restore')}</Text>
          </Pressable>

          <Text style={styles.legal}>{t('premium.legal')}</Text>
          <Text style={styles.legal}>{t('premium.autoRenewInfo')}</Text>

          {/* Both links are mandatory on a screen that sells a subscription. */}
          <View style={styles.links}>
            <Pressable onPress={() => openLegalUrl(TERMS_URL)}>
              <Text style={styles.linkText}>{t('premium.terms')}</Text>
            </Pressable>
            <Text style={styles.linkSeparator}>·</Text>
            <Pressable onPress={() => openLegalUrl(PRIVACY_POLICY_URL)}>
              <Text style={styles.linkText}>{t('premium.privacy')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  backButton: { flexDirection: 'row', alignItems: 'center', minWidth: 80 },
  backText: { color: colors.text, fontSize: 16, fontWeight: '600', marginLeft: -2 },
  headerSpacer: { minWidth: 80 },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  headline: { color: colors.text, fontSize: 17, fontWeight: '600', lineHeight: 24 },
  features: { gap: 10, marginTop: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { color: colors.text, fontSize: 14, flex: 1, lineHeight: 20 },
  stillFree: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
  },
  choosePlan: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 4 },
  spinner: { marginTop: 24 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  planActive: { borderColor: colors.safe, borderWidth: 2 },
  planBody: { flex: 1 },
  planTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  planDuration: { color: colors.text, fontSize: 12, marginTop: 3 },
  planNote: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  planPrice: { color: colors.safe, fontSize: 18, fontWeight: '800' },
  cta: {
    backgroundColor: colors.safe,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  unavailableBox: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  unavailable: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  restore: { alignItems: 'center', paddingVertical: 14 },
  restoreText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  legal: { color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  linkText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  linkSeparator: { color: colors.textMuted, fontSize: 12 },
});
