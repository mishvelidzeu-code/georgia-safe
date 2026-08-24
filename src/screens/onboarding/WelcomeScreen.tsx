import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../../theme/colors';
import { useLanguage } from '../../i18n/LanguageContext';
import type { LanguageCode } from '../../i18n/LanguageContext';
import OnboardingEmergencyBar from '../../components/OnboardingEmergencyBar';

const LANGUAGES: LanguageCode[] = ['en', 'ka', 'ru'];
const LANGUAGE_SHORT: Record<LanguageCode, string> = { en: 'EN', ka: 'ქარ', ru: 'RUS' };

type Props = {
  onStart: () => void;
  onLogin: () => void;
  onGuest: () => void;
};

export default function WelcomeScreen({ onStart, onLogin, onGuest }: Props) {
  const { t, language, setLanguage } = useLanguage();

  return (
    <View style={styles.container}>
      {/* This is the very first screen a tourist sees, before the onboarding
          language step — without a switcher here it would show in whatever
          the device locale is (usually English) with no way to change it. */}
      <View style={styles.languageRow}>
        {LANGUAGES.map((code) => (
          <Pressable
            key={code}
            style={[styles.languagePill, language === code && styles.languagePillActive]}
            onPress={() => setLanguage(code)}
          >
            <Text
              style={[
                styles.languagePillText,
                language === code && styles.languagePillTextActive,
              ]}
            >
              {LANGUAGE_SHORT[code]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        <Image
          source={require('../../../assets/1.png')}
          style={styles.mascot}
          contentFit="contain"
        />
        <Text style={styles.title}>{t('onboarding.welcomeTitle')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.welcomeSubtitle')}</Text>

        <Pressable style={styles.primaryButton} onPress={onStart}>
          <Text style={styles.primaryText}>{t('onboarding.getStarted')}</Text>
        </Pressable>

        {/* No account needed to look around: the map, the emergency numbers
            and SOS are the reason someone installs this, and none of them
            need to know who she is. */}
        <Pressable style={styles.guestButton} onPress={onGuest}>
          <Text style={styles.guestText}>{t('onboarding.continueAsGuest')}</Text>
        </Pressable>
        <Text style={styles.guestHint}>{t('onboarding.guestHint')}</Text>

        <View style={styles.loginRow}>
          <Text style={styles.loginHint}>{t('onboarding.haveAccount')}</Text>
          <Pressable onPress={onLogin} hitSlop={8}>
            <Text style={styles.loginLink}>{t('onboarding.login')}</Text>
          </Pressable>
        </View>
      </View>

      <OnboardingEmergencyBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  languageRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 64,
  },
  languagePill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  languagePillActive: {
    backgroundColor: colors.safe,
    borderColor: colors.safe,
  },
  languagePillText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  languagePillTextActive: {
    color: colors.background,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  mascot: {
    width: 180,
    height: 180,
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 10,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.safe,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  guestButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  guestText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  guestHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 8,
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  loginHint: {
    color: colors.textMuted,
    fontSize: 14,
  },
  loginLink: {
    color: colors.safe,
    fontSize: 14,
    fontWeight: '700',
  },
});
