import { NavigationContainer, DarkTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import MapScreen from '../screens/MapScreen';
import GettingAroundScreen from '../screens/GettingAroundScreen';
import AlertsScreen from '../screens/AlertsScreen';
import EmergencyScreen from '../screens/EmergencyScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SosButton from '../components/SosButton';
import GuardianButton from '../components/GuardianButton';
import NightSafetyBanner from '../components/NightSafetyBanner';
import GuardianSuggestionBubble from '../components/GuardianSuggestionBubble';
import GuardianModal from '../components/GuardianModal';
import { GuardianChatProvider } from '../guardian/GuardianChatContext';
import { PremiumProvider } from '../premium/PremiumContext';
import PaywallModal from '../components/PaywallModal';

const Tab = createBottomTabNavigator();

// Wraps each tab screen with the floating SOS + AI Guardian buttons so both
// stay reachable from every screen (SOS placement is a CLAUDE.md design
// rule; Guardian mirrors it on the opposite corner — see gegma.txt 5.2).
// Defined once at module scope so the wrapped components keep a stable
// identity across re-renders.
function withSos(Screen: React.ComponentType) {
  return function ScreenWithSos() {
    return (
      <>
        <Screen />
        <SosButton />
        <GuardianButton />
      </>
    );
  };
}

const MapScreenWithSos = withSos(MapScreen);
const GettingAroundScreenWithSos = withSos(GettingAroundScreen);
const AlertsScreenWithSos = withSos(AlertsScreen);
const EmergencyScreenWithSos = withSos(EmergencyScreen);
const ProfileScreenWithSos = withSos(ProfileScreen);

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.safe,
  },
};

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, IconName> = {
  Map: 'map',
  GettingAround: 'car',
  Alerts: 'warning',
  Emergency: 'medkit',
  Profile: 'person',
};

export default function RootNavigator() {
  // GuardianSuggestionBubble reads the current route imperatively (not via
  // useNavigationState) because it's rendered as a sibling of Tab.Navigator,
  // not a descendant of it — useNavigationState requires being inside an
  // actual navigator, which a sibling of NavigationContainer isn't.
  const navigationRef = useNavigationContainerRef();

  return (
    // The provider wraps everything so the assistant's conversation outlives
    // tab switches; GuardianModal below is the app's only chat window.
    <PremiumProvider>
    <GuardianChatProvider>
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
          tabBarActiveTintColor: route.name === 'Emergency' ? colors.risk : colors.safe,
          tabBarInactiveTintColor:
            route.name === 'Emergency' ? colors.risk : colors.textMuted,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Map" component={MapScreenWithSos} />
        <Tab.Screen
          name="GettingAround"
          component={GettingAroundScreenWithSos}
          options={{ title: 'Getting Around' }}
        />
        <Tab.Screen name="Alerts" component={AlertsScreenWithSos} />
        <Tab.Screen name="Emergency" component={EmergencyScreenWithSos} />
        <Tab.Screen name="Profile" component={ProfileScreenWithSos} />
      </Tab.Navigator>
      <NightSafetyBanner />
      <GuardianSuggestionBubble navigationRef={navigationRef} />
      <GuardianModal />
      <PaywallModal />
    </NavigationContainer>
    </GuardianChatProvider>
    </PremiumProvider>
  );
}
