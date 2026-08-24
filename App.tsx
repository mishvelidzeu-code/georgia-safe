import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForNotificationsAsync } from './src/lib/notifications';
import { LanguageProvider } from './src/i18n/LanguageContext';
import { AuthProvider } from './src/auth/AuthContext';
import AppEntry from './src/navigation/AppEntry';

// Hold the native splash (the mascot on the dark background, configured in
// app.json) until the stored language and auth session have been restored —
// otherwise the app flashes the welcome screen for a moment before deciding
// the tourist is actually already signed in. AppEntry hides it once it knows
// which screen to show.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // The update check lives in AppEntry instead: it has to run inside
  // LanguageProvider so the prompt is in the tourist's own language.
  useEffect(() => {
    registerForNotificationsAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Required at the root: react-native-safe-area-context throws if a
          SafeAreaView or useSafeAreaInsets renders without it. React
          Navigation only provides one *inside* the tab navigator, so the
          full-screen modals rendered beside it (the chat, the paywall) were
          not covered. */}
      <SafeAreaProvider>
        <LanguageProvider>
          <AuthProvider>
            <AppEntry />
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}
