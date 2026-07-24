import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { getGuardianContext } from '../lib/guardianContext';
import type { GuardianContext } from '../lib/guardianContext';
import GuardianModal from './GuardianModal';

// Re-check every 5 minutes so the banner can still appear if the tourist
// already had the app open when it turned into a risky hour (not just at
// cold launch) — see gegma.txt 5.4.
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

function composeAutoMessage(context: GuardianContext, t: (key: string) => string): string {
  if (!context.zoneName) return t('guardian.autoMessageGeneric');
  const levelLabel =
    context.zoneLevel === 'red'
      ? t('guardian.autoMessageHighRiskLabel')
      : t('guardian.autoMessageCautionLabel');
  return `${context.zoneName} — ${levelLabel}. ${t('guardian.autoMessageQuestion')}`;
}

// Rendered once at the root level (not per-tab) so it isn't re-mounted (and
// re-checked) every time the user switches tabs. Positioned below Map's own
// top row (day/night toggle + layers button) to avoid overlapping it there;
// on other screens it simply floats over the top of the scrollable content,
// consistent with this app's existing floating-card idiom (Map's toggle/
// layers panel, the SOS/Guardian FABs).
export default function NightSafetyBanner() {
  const { t } = useLanguage();
  const [context, setContext] = useState<GuardianContext | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [guardianVisible, setGuardianVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function check() {
      getGuardianContext().then((result) => {
        if (!cancelled) setContext(result);
      });
    }

    check();
    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleSuggestRoute = useCallback(() => {
    setDismissed(true);
    setGuardianVisible(true);
  }, []);

  const isRisky =
    context !== null &&
    context.timeOfDay === 'night' &&
    (context.zoneLevel === 'yellow' || context.zoneLevel === 'red');

  if (!isRisky || dismissed) {
    // Still render the modal (hidden) so state isn't lost if it was opened
    // just before conditions changed — in practice this is effectively a
    // no-op render.
    return <GuardianModal visible={guardianVisible} onClose={() => setGuardianVisible(false)} />;
  }

  return (
    <>
      <View style={styles.banner}>
        <View style={styles.content}>
          <Ionicons name="moon" size={18} color={colors.background} />
          <Text style={styles.text}>{t('nightBanner.message')}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.actionButton} onPress={handleSuggestRoute}>
            <Text style={styles.actionText}>{t('nightBanner.suggest')}</Text>
          </Pressable>
          <Pressable style={styles.dismissButton} onPress={() => setDismissed(true)} hitSlop={10}>
            <Ionicons name="close" size={18} color={colors.background} />
          </Pressable>
        </View>
      </View>

      <GuardianModal
        visible={guardianVisible}
        onClose={() => setGuardianVisible(false)}
        autoSendMessage={composeAutoMessage(context, t)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 104,
    left: 16,
    right: 16,
    backgroundColor: colors.warning,
    borderRadius: 14,
    padding: 14,
    zIndex: 20,
    elevation: 8,
    shadowColor: colors.black,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  text: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  actionText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
  dismissButton: {
    padding: 4,
  },
});
