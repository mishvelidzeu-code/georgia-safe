import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { getGuardianContext } from '../lib/guardianContext';
import type { GuardianRiskZone } from '../lib/guardianContext';
import { riskZoneComment } from '../lib/riskZones';
import { useRiskZones } from '../lib/useRiskZones';
import { useGuardianChat } from '../guardian/GuardianChatContext';

// Re-check every 5 minutes so the banner can still appear if the tourist
// walks into a zone while the app is already open (not just at cold launch).
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

function composeAutoMessage(zone: GuardianRiskZone, comment: string, t: (key: string) => string): string {
  const levelLabel =
    zone.level === 'red'
      ? t('guardian.autoMessageHighRiskLabel')
      : t('guardian.autoMessageCautionLabel');
  return `${levelLabel}: ${comment}. ${t('guardian.autoMessageQuestion')}`;
}

// Shown while the tourist is physically inside an admin-marked risk zone —
// day or night; a zone marked around an accident at noon matters as much as
// a rough street at 2am. Rendered once at the root level (not per-tab) so it
// isn't re-mounted (and re-checked) every time the user switches tabs.
// Positioned below Map's own top row (day/night toggle + layers button) to
// avoid overlapping it there; on other screens it simply floats over the top
// of the scrollable content, consistent with this app's floating-card idiom.
export default function NightSafetyBanner() {
  const { t, language } = useLanguage();
  const [zone, setZone] = useState<GuardianRiskZone | null>(null);
  // Dismissal is per zone, so a new incident re-raises the banner after the
  // previous one was closed.
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const { open } = useGuardianChat();
  // The same cache the context reads — used only to show the comment in the
  // app language (the context carries the English one for the prompt).
  const zones = useRiskZones();

  useEffect(() => {
    let cancelled = false;

    function check() {
      // Re-checked every 5 minutes and only uses zone/time — skip the rentals.
      getGuardianContext({ includeRentals: false }).then((result) => {
        if (!cancelled) setZone(result.riskZone?.inside ? result.riskZone : null);
      });
    }

    check();
    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const cached = zone === null ? undefined : zones.find((candidate) => candidate.id === zone.id);
  const localizedComment = cached ? riskZoneComment(cached, language) : zone?.comment ?? '';

  const handleSuggestRoute = useCallback(() => {
    if (!zone) return;
    setDismissedId(zone.id);
    open(composeAutoMessage(zone, localizedComment, t));
  }, [zone, localizedComment, open, t]);

  // The chat is rendered once at the root now, so there is nothing to keep
  // alive here — an inactive banner renders nothing at all.
  if (zone === null || dismissedId === zone.id) return null;

  return (
    <>
      <View style={styles.banner}>
        <View style={styles.content}>
          <Ionicons name="warning" size={18} color={colors.background} />
          <Text style={styles.text}>
            {t(zone.level === 'red' ? 'nightBanner.messageRed' : 'nightBanner.messageOrange')}
            {localizedComment ? ` ${localizedComment}` : ''}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.actionButton} onPress={handleSuggestRoute}>
            <Text style={styles.actionText}>{t('nightBanner.suggest')}</Text>
          </Pressable>
          <Pressable style={styles.dismissButton} onPress={() => setDismissedId(zone.id)} hitSlop={10}>
            <Ionicons name="close" size={18} color={colors.background} />
          </Pressable>
        </View>
      </View>
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
