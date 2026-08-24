import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import type { AppStateStatus } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { checkForAppUpdateAsync } from '../lib/updates';
import AnimatedSplash from '../components/AnimatedSplash';
import AuthFlow from '../screens/onboarding/AuthFlow';
import RootNavigator from './RootNavigator';

/**
 * Decides what the tourist sees after the splash: the onboarding/login flow,
 * or the main tabs. Kept separate from App.tsx because it has to sit *inside*
 * AuthProvider to read the session.
 *
 * Splash handover: the still native splash is hidden as soon as the session
 * has been restored, revealing AnimatedSplash — which starts out identical to
 * it and then zooms in and fades out. So the tourist sees one continuous
 * animation rather than a cut between two splashes.
 */
/**
 * Don't nag: an update that has just been declined should not be offered again
 * the next time the tourist switches back from the map app.
 */
const UPDATE_RECHECK_MS = 30 * 60 * 1000;

export default function AppEntry() {
  const { initializing, onboardingDone, guest } = useAuth();
  const { t } = useLanguage();
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);
  const lastUpdateCheckRef = useRef(0);

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync().catch(() => {});
  }, [initializing]);

  // Checked at launch and again whenever the app comes back to the foreground:
  // a tourist can keep this app open all day, and an update published at noon
  // should not have to wait for the next cold start.
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      if (now - lastUpdateCheckRef.current < UPDATE_RECHECK_MS) return;
      lastUpdateCheckRef.current = now;
      void checkForAppUpdateAsync(t);
    };

    check();
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, [t]);

  const handleSplashFinish = useCallback(() => setSplashAnimationDone(true), []);

  // Nothing to show yet — the native splash is still up.
  if (initializing) return null;

  return (
    <View style={styles.container}>
      {onboardingDone || guest ? <RootNavigator /> : <AuthFlow />}
      {!splashAnimationDone && <AnimatedSplash onFinish={handleSplashFinish} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
