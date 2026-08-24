import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { getGuardianContext } from '../lib/guardianContext';
import { getFabOffset } from '../lib/storage';
import type { FabOffset } from '../lib/storage';
import { useGuardianChat } from '../guardian/GuardianChatContext';
import { useAuth } from '../auth/AuthContext';

// First appearance shortly after launch (so the feature is discoverable
// without waiting a full interval), then every few minutes after that —
// "ხანდახან", not constantly. Auto-hides on its own if ignored, same as the
// day/night mode toast elsewhere on Map.
const FIRST_SHOW_DELAY_MS = 45 * 1000;
const REPEAT_INTERVAL_MS = 4 * 60 * 1000;
const AUTO_HIDE_MS = 9000;

function pickSuggestion(routeName: string | undefined, t: (key: string) => string): string {
  const pool = [t('guardianSuggest.askAnything'), t('guardianSuggest.planDay')];
  if (routeName === 'Map') pool.push(t('guardianSuggest.nearbyPlaces'));
  if (routeName === 'GettingAround') pool.push(t('guardianSuggest.taxiHelp'));
  if (routeName === 'Alerts') pool.push(t('guardianSuggest.scamHelp'));
  return pool[Math.floor(Math.random() * pool.length)];
}

// Rendered once at the root level (like NightSafetyBanner), not per-tab, so
// it isn't re-mounted (and its timers reset) every time the tourist switches
// tabs. Visually anchored just above GuardianButton's fixed position (which
// is the same on every tab), so it reads as "coming from" the mascot however
// you got here.
type Props = {
  // Passed down from RootNavigator instead of read via useNavigationState —
  // this component is a sibling of Tab.Navigator (not a descendant of it),
  // so the hook has no navigator context to attach to. The imperative ref
  // works from anywhere. Untyped param list (matches ParamListBase) since
  // this app's tabs aren't given a typed navigator param list elsewhere.
  navigationRef: NavigationContainerRefWithCurrent<Record<string, object | undefined>>;
};

export default function GuardianSuggestionBubble({ navigationRef }: Props) {
  const { t } = useLanguage();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const { visible: guardianVisible, open } = useGuardianChat();
  const { guest } = useAuth();
  const [fabOffset, setFabOffset] = useState<FabOffset | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardianVisibleRef = useRef(false);

  useEffect(() => {
    guardianVisibleRef.current = guardianVisible;
  }, [guardianVisible]);

  const showSuggestion = useCallback(async () => {
    if (guardianVisibleRef.current) return; // don't interrupt an active chat
    // A guest can't open the chat, and a bubble that pops up every few
    // minutes only to ask them to sign up is nagging, not help. The mascot
    // itself stays — tapping it is their own decision.
    if (guest) return;
    // Only zone/time matter here, and this runs on a timer — no point paying
    // for the rental lookup every few minutes.
    const context = await getGuardianContext({ includeRentals: false });
    const isNightRisky =
      context.timeOfDay === 'night' && (context.zoneLevel === 'yellow' || context.zoneLevel === 'red');
    if (isNightRisky) return; // NightSafetyBanner already owns this moment

    // The mascot is draggable (see DraggableFab), so read where it currently
    // sits and shift the bubble by the same amount — otherwise the speech
    // bubble would hang over the corner the mascot has been moved away from.
    setFabOffset(await getFabOffset('guardian'));

    const routeName = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
    setSuggestion(pickSuggestion(routeName, t));
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setSuggestion(null), AUTO_HIDE_MS);
  }, [navigationRef, t, guest]);

  useEffect(() => {
    const firstTimer = setTimeout(showSuggestion, FIRST_SHOW_DELAY_MS);
    const interval = setInterval(showSuggestion, REPEAT_INTERVAL_MS);
    return () => {
      clearTimeout(firstTimer);
      clearInterval(interval);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // Re-armed only if the callback identity changes (route/language) — the
    // timers themselves aren't meant to reset on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSuggestion]);

  const handlePress = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    open(suggestion ?? undefined);
    setSuggestion(null);
  };

  const handleDismiss = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setSuggestion(null);
  };

  return (
    <>
      {suggestion && (
        <Pressable
          style={[
            styles.bubble,
            fabOffset
              ? { transform: [{ translateX: fabOffset.x }, { translateY: fabOffset.y }] }
              : null,
          ]}
          onPress={handlePress}
        >
          <Text style={styles.text}>{suggestion}</Text>
          <Pressable style={styles.closeButton} onPress={handleDismiss} hitSlop={8}>
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </Pressable>
          <View style={styles.tail} />
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    left: 12,
    // Clears the mascot completely: GuardianButton sits at bottom 88 and its
    // character image is 98 tall plus a label, so anything under ~200 overlaps
    // it. Raised well clear of that so the bubble reads as speech floating
    // above the mascot's head, with room for a two-line suggestion.
    bottom: 300,
    maxWidth: 220,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 26,
    zIndex: 15,
    elevation: 8,
    shadowColor: colors.black,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  text: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  closeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    padding: 4,
  },
  tail: {
    position: 'absolute',
    bottom: -8,
    left: 24,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.card,
  },
});
