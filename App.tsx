import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { registerForNotificationsAsync } from './src/lib/notifications';
import { checkForAppUpdateAsync } from './src/lib/updates';
import { LanguageProvider } from './src/i18n/LanguageContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  useEffect(() => {
    registerForNotificationsAsync();
    checkForAppUpdateAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
        <RootNavigator />
      </LanguageProvider>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}
