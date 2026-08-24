import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useLanguage } from '../../i18n/LanguageContext';
import type { LanguageCode } from '../../i18n/LanguageContext';
import CountryPickerModal from '../../components/CountryPickerModal';
import OnboardingEmergencyBar from '../../components/OnboardingEmergencyBar';
import { MIN_PASSWORD_LENGTH, isValidEmail, signUp } from '../../lib/auth';
import type { AuthFailureReason } from '../../lib/auth';
import { VISIT_LENGTHS, saveOnboardingProfile } from '../../lib/profile';
import type { OnboardingDraft, VisitLength } from '../../lib/profile';
import { findCountry, countryName } from '../../lib/countries';

const LANGUAGES: LanguageCode[] = ['en', 'ka', 'ru'];
const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  ka: 'ქართული',
  ru: 'Русский',
};

const VISIT_LENGTH_LABEL_KEYS: Record<VisitLength, string> = {
  days: 'onboarding.lengthDays',
  week: 'onboarding.lengthWeek',
  weeks: 'onboarding.lengthWeeks',
  month: 'onboarding.lengthMonth',
  longer: 'onboarding.lengthLonger',
};

const VISIT_NUMBERS: { value: number; labelKey: string }[] = [
  { value: 1, labelKey: 'onboarding.visitFirst' },
  { value: 2, labelKey: 'onboarding.visitSecond' },
  { value: 3, labelKey: 'onboarding.visitThird' },
  { value: 4, labelKey: 'onboarding.visitMore' },
];

const AUTH_ERROR_KEYS: Record<AuthFailureReason, string> = {
  offline: 'onboarding.errOffline',
  'invalid-credentials': 'onboarding.errInvalidLogin',
  'email-taken': 'onboarding.errEmailTaken',
  'weak-password': 'onboarding.errPassword',
  unknown: 'onboarding.errUnknown',
};

type Props = {
  /**
   * True when an account already exists but the profile row doesn't — e.g.
   * sign-up succeeded last time but the profile write failed. Then the final
   * step just saves the profile instead of creating a second account.
   */
  alreadyAuthenticated: boolean;
  onDone: () => void;
  onGoToLogin: () => void;
};

export default function OnboardingScreen({ alreadyAuthenticated, onDone, onGoToLogin }: Props) {
  const { t, language, setLanguage } = useLanguage();
  // Language is step 1 so everything after it is already in the tourist's own
  // language; the account step is dropped when they're signed in already.
  const totalSteps = alreadyAuthenticated ? 5 : 6;

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ageText, setAgeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const selectedCountry = useMemo(() => findCountry(draft.countryId ?? null), [draft.countryId]);

  function goBack() {
    setError(null);
    if (step === 0) return;
    setStep((s) => s - 1);
  }

  async function goNext() {
    setError(null);

    // Step 0 is language — a language is always set (device default), so
    // there's nothing to validate.
    if (step === 1) {
      if (!draft.countryId) return setError(t('onboarding.errRequired'));
    } else if (step === 2) {
      if (!draft.fullName?.trim()) return setError(t('onboarding.errRequired'));
    } else if (step === 3) {
      if (!draft.visitLength || !draft.visitNumber) return setError(t('onboarding.errRequired'));
    } else if (step === 4) {
      const age = Number(ageText);
      if (!ageText.trim() || !Number.isInteger(age) || age < 13 || age > 120) {
        return setError(t('onboarding.errAge'));
      }
      setDraft((d) => ({ ...d, age }));
      // Already signed in — nothing left to ask, save and finish.
      if (alreadyAuthenticated) {
        return finish({ ...draft, age });
      }
    } else if (step === 5) {
      return createAccount();
    }

    setStep((s) => s + 1);
  }

  async function finish(finalDraft: OnboardingDraft) {
    setSubmitting(true);
    const saved = await saveOnboardingProfile(finalDraft);
    setSubmitting(false);
    // The country is mirrored to local storage even when the server write
    // fails, so the Emergency screen is still correct — let them into the app
    // rather than trapping them behind a retry loop.
    if (!saved) {
      Alert.alert(t('onboarding.errProfileSave'));
    }
    onDone();
  }

  async function createAccount() {
    Keyboard.dismiss();
    if (!isValidEmail(email)) return setError(t('onboarding.errEmail'));
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(t('onboarding.errPassword').replace('{min}', String(MIN_PASSWORD_LENGTH)));
    }
    if (password !== confirmPassword) return setError(t('onboarding.errPasswordMismatch'));

    setSubmitting(true);
    const result = await signUp(email, password);
    setSubmitting(false);

    if (!result.ok) {
      return setError(t(AUTH_ERROR_KEYS[result.reason]).replace('{min}', String(MIN_PASSWORD_LENGTH)));
    }

    if (result.needsEmailConfirmation) {
      // The project has email confirmation on: there's no session yet, so we
      // can't write the profile. Send them to log in after confirming.
      Alert.alert(t('onboarding.checkEmailTitle'), t('onboarding.checkEmailBody'), [
        { text: t('onboarding.login'), onPress: onGoToLogin },
      ]);
      return;
    }

    await finish(draft);
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
          <View style={styles.progressRow}>
            {Array.from({ length: totalSteps }).map((_, index) => (
              <View
                key={index}
                style={[styles.progressDot, index <= step && styles.progressDotActive]}
              />
            ))}
          </View>
          <Text style={styles.stepLabel}>
            {t('onboarding.stepOf')
              .replace('{current}', String(step + 1))
              .replace('{total}', String(totalSteps))}
          </Text>

          {step === 0 && (
            <>
              <Text style={styles.title}>{t('onboarding.languageTitle')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.languageSubtitle')}</Text>
              <View style={styles.languageColumn}>
                {LANGUAGES.map((code) => (
                  <Pressable
                    key={code}
                    style={[styles.languageOption, language === code && styles.languageOptionActive]}
                    onPress={() => setLanguage(code)}
                  >
                    <Text
                      style={[
                        styles.languageOptionText,
                        language === code && styles.languageOptionTextActive,
                      ]}
                    >
                      {LANGUAGE_NAMES[code]}
                    </Text>
                    {language === code && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.background} />
                    )}
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.title}>{t('onboarding.countryTitle')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.countrySubtitle')}</Text>
              <Pressable style={styles.selectButton} onPress={() => setPickerVisible(true)}>
                <Text style={selectedCountry ? styles.selectValue : styles.selectPlaceholder}>
                  {selectedCountry
                    ? countryName(selectedCountry, language)
                    : t('onboarding.selectCountry')}
                </Text>
                <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
              </Pressable>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.title}>{t('onboarding.nameTitle')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.nameSubtitle')}</Text>
              <TextInput
                style={styles.input}
                value={draft.fullName ?? ''}
                onChangeText={(v) => setDraft((d) => ({ ...d, fullName: v }))}
                placeholder={t('onboarding.namePlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.title}>{t('onboarding.visitTitle')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.visitSubtitle')}</Text>

              <Text style={styles.fieldLabel}>{t('onboarding.visitLengthLabel')}</Text>
              <View style={styles.chipRow}>
                {VISIT_LENGTHS.map((length) => (
                  <Pressable
                    key={length}
                    style={[styles.chip, draft.visitLength === length && styles.chipActive]}
                    onPress={() => setDraft((d) => ({ ...d, visitLength: length }))}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        draft.visitLength === length && styles.chipTextActive,
                      ]}
                    >
                      {t(VISIT_LENGTH_LABEL_KEYS[length])}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t('onboarding.visitNumberLabel')}</Text>
              <View style={styles.chipRow}>
                {VISIT_NUMBERS.map(({ value, labelKey }) => (
                  <Pressable
                    key={value}
                    style={[styles.chip, draft.visitNumber === value && styles.chipActive]}
                    onPress={() => setDraft((d) => ({ ...d, visitNumber: value }))}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        draft.visitNumber === value && styles.chipTextActive,
                      ]}
                    >
                      {t(labelKey)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {step === 4 && (
            <>
              <Text style={styles.title}>{t('onboarding.ageTitle')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.ageSubtitle')}</Text>
              <TextInput
                style={styles.input}
                value={ageText}
                onChangeText={(v) => setAgeText(v.replace(/[^0-9]/g, '').slice(0, 3))}
                placeholder={t('onboarding.agePlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </>
          )}

          {step === 5 && (
            <>
              <Text style={styles.title}>{t('onboarding.accountTitle')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.accountSubtitle')}</Text>
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
                textContentType="newPassword"
              />
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={t('onboarding.confirmPasswordPlaceholder')}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.navRow}>
            {step > 0 && (
              <Pressable style={styles.backButton} onPress={goBack} disabled={submitting}>
                <Text style={styles.backText}>{t('onboarding.back')}</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.nextButton, submitting && styles.nextButtonDisabled]}
              onPress={goNext}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.nextText}>
                  {step === totalSteps - 1
                    ? alreadyAuthenticated
                      ? t('onboarding.saveProfile')
                      : t('onboarding.createAccount')
                    : t('onboarding.next')}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>

        <OnboardingEmergencyBar />
      </KeyboardAvoidingView>

      <CountryPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(id) => {
          setDraft((d) => ({ ...d, countryId: id }));
          setPickerVisible(false);
        }}
      />
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
    paddingTop: 72,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  progressDotActive: {
    backgroundColor: colors.safe,
  },
  stepLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 20,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  selectValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  selectPlaceholder: {
    color: colors.textMuted,
    fontSize: 16,
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
  languageColumn: {
    gap: 10,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  languageOptionActive: {
    backgroundColor: colors.safe,
    borderColor: colors.safe,
  },
  languageOptionText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  languageOptionTextActive: {
    color: colors.background,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipActive: {
    backgroundColor: colors.safe,
    borderColor: colors.safe,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.background,
  },
  error: {
    color: colors.risk,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  backButton: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  backText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  nextButton: {
    flex: 1,
    backgroundColor: colors.safe,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
});
