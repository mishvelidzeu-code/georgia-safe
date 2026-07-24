import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { getTrustedContact } from '../lib/storage';
import FakeCallScreen from './FakeCallScreen';

// Fixed 10s delay per gegma.txt 6.1 ("10 წამში ყალბი შემომავალი ზარის
// ეკრანი") — not user-configurable, gives just enough time to put the
// phone away/act natural before it starts "ringing".
const DELAY_SECONDS = 10;

// Self-contained button + timer + full-screen call UI, embedded directly on
// both Profile and Emergency screens (same pattern as SosButton/
// GuardianButton elsewhere in this app) rather than lifting shared state —
// each instance is independent, and only one screen is in view at a time.
export default function FakeCallButton() {
  const { t } = useLanguage();
  const [countingDown, setCountingDown] = useState(false);
  const [callVisible, setCallVisible] = useState(false);
  const [callerName, setCallerName] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handlePress = useCallback(async () => {
    if (countingDown || callVisible) return;

    const contact = await getTrustedContact();
    setCallerName(contact?.name || t('fakeCall.defaultCallerName'));
    setCountingDown(true);

    timeoutRef.current = setTimeout(() => {
      setCountingDown(false);
      setCallVisible(true);
    }, DELAY_SECONDS * 1000);
  }, [countingDown, callVisible, t]);

  return (
    <View style={styles.card}>
      <Text style={styles.hint}>{t('fakeCall.hint')}</Text>
      <Pressable
        style={[styles.button, countingDown && styles.buttonActive]}
        onPress={handlePress}
        disabled={countingDown}
      >
        <Ionicons name="call" size={16} color={colors.background} />
        <Text style={styles.buttonText}>
          {countingDown
            ? t('fakeCall.startingIn').replace('{n}', String(DELAY_SECONDS))
            : t('fakeCall.button')}
        </Text>
      </Pressable>

      <FakeCallScreen
        visible={callVisible}
        callerName={callerName}
        onEnd={() => setCallVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.safe,
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
  },
  buttonActive: {
    backgroundColor: colors.border,
  },
  buttonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
});
