import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * Always-visible "call 112" escape hatch shown on every onboarding and login
 * screen.
 *
 * This app exists for solo travellers in unsafe situations, so someone who
 * installs it *while already in danger* must never be stuck behind a sign-up
 * form to reach emergency services. tel: uses the cellular voice network
 * rather than internet data, so this works even with no connectivity — which
 * is also why it stays useful when account creation itself would fail.
 */
export default function OnboardingEmergencyBar() {
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>{t('onboarding.emergencyHint')}</Text>
      <Pressable
        style={styles.button}
        onPress={() => Linking.openURL('tel:112').catch(() => {})}
        accessibilityRole="button"
      >
        <Ionicons name="call" size={18} color={colors.white} />
        <Text style={styles.buttonText}>{t('onboarding.call112')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.risk,
    borderRadius: 12,
    paddingVertical: 12,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
