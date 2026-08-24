import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { useGuardianChat } from '../guardian/GuardianChatContext';
import DraggableFab from './DraggableFab';
import { tapFeedback } from '../lib/haptics';

// Mirrors SosButton's placement (bottom-left) on the opposite corner so both
// floating actions stay reachable from every screen without overlapping.
// Shows Guardian's full mascot character (assets/guardian_full.png, no circle
// clip) with an "AI Assistant" label above it, so the assistant reads as a
// character rather than a generic chat button.
export default function GuardianButton() {
  const { t } = useLanguage();
  // withSos() mounts this button on every tab, so it must not own the chat —
  // it only opens the single shared one (see GuardianChatProvider).
  const { open, showIntroBadge } = useGuardianChat();

  return (
    // Positioning lives in DraggableFab now — hold the mascot to move it.
    <DraggableFab id="guardian" width={92} height={112} anchor={{ left: 12, bottom: 88 }}>
      <Pressable
        style={styles.fab}
        onPress={() => {
          tapFeedback();
          open();
        }}
      >
        <Text style={styles.label}>{t('guardian.fab')}</Text>
        {/* Unread-style badge: the assistant is the least discoverable part of
            the app, and a tourist who never opens it loses most of its value. */}
        {showIntroBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>1</Text>
          </View>
        )}
        <Image
          source={require('../../assets/guardian_full.png')}
          style={styles.character}
          contentFit="contain"
        />
      </Pressable>
    </DraggableFab>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  label: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 2,
    textShadowColor: colors.background,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.risk,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    zIndex: 2,
  },
  badgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  character: {
    width: 92,
    height: 98,
  },
});
