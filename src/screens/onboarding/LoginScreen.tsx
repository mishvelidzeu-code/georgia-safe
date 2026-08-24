import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useLanguage } from '../../i18n/LanguageContext';
import OnboardingEmergencyBar from '../../components/OnboardingEmergencyBar';
import { MIN_PASSWORD_LENGTH, isValidEmail, signIn } from '../../lib/auth';
import type { AuthFailureReason } from '../../lib/auth';

const AUTH_ERROR_KEYS: Record<AuthFailureReason, string> = {
  offline: 'onboarding.errOffline',
  'invalid-credentials': 'onboarding.errInvalidLogin',
  'email-taken': 'onboarding.errEmailTaken',
  'weak-password': 'onboarding.errInvalidLogin',
  unknown: 'onboarding.errUnknown',
};

type Props = {
  onLoggedIn: () => void;
  onGoToSignUp: () => void;
};

export default function LoginScreen({ onLoggedIn, onGoToSignUp }: Props) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    Keyboard.dismiss();
    setError(null);
    if (!isValidEmail(email)) return setError(t('onboarding.errEmail'));
    if (!password) return setError(t('onboarding.errRequired'));

    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);

    if (!result.ok) {
      return setError(t(AUTH_ERROR_KEYS[result.reason]).replace('{min}', String(MIN_PASSWORD_LENGTH)));
    }
    onLoggedIn();
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{t('onboarding.loginTitle')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.loginSubtitle')}</Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t('onboarding.emailPlaceholder')}
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t('onboarding.passwordPlaceholder').replace(
              '{min}',
              String(MIN_PASSWORD_LENGTH),
            )}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            onPress={handleLogin}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.primaryText}>{t('onboarding.loginButton')}</Text>
            )}
          </Pressable>

          <View style={styles.signUpRow}>
            <Text style={styles.signUpHint}>{t('onboarding.noAccount')}</Text>
            <Pressable onPress={onGoToSignUp} hitSlop={8} disabled={submitting}>
              <Text style={styles.signUpLink}>{t('onboarding.signUpLink')}</Text>
            </Pressable>
          </View>
        </ScrollView>

        <OnboardingEmergencyBar />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 96,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 28,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  error: {
    color: colors.risk,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: colors.safe,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  signUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  signUpHint: {
    color: colors.textMuted,
    fontSize: 14,
  },
  signUpLink: {
    color: colors.safe,
    fontSize: 14,
    fontWeight: '700',
  },
});
