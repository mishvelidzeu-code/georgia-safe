import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { getTrustedContact } from '../lib/storage';
import { sendLocationSms } from '../lib/locationSms';

const DURATION_OPTIONS_MIN = [15, 30, 60];

type ActiveCheckIn = {
  endsAt: number;
  notificationId: string;
};

// "I'll be back in 30 min" (gegma.txt 6.1): starts a countdown; if the
// tourist doesn't tap "I'm back" before it ends, texts the trusted contact
// with their last known location (shares locationSms.ts with SosButton).
//
// Scope note: this only fires reliably while the app is foregrounded or
// briefly backgrounded — it's a plain JS timer, not a background task, so a
// tourist who fully closes the app won't trigger the automatic SMS. The
// scheduled local notification is a best-effort nudge on top of that, not a
// guarantee. Reliable background delivery would need a background task /
// server-side scheduler — out of scope for this MVP step.
export default function CheckInTimer() {
  const { t } = useLanguage();
  const [active, setActive] = useState<ActiveCheckIn | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [autoSentNotice, setAutoSentNotice] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSentNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      if (autoSentNoticeTimeoutRef.current) clearTimeout(autoSentNoticeTimeoutRef.current);
    };
  }, [clearTimers]);

  const handleAutoSend = useCallback(
    async (endsAt: number) => {
      const contact = await getTrustedContact();
      if (contact?.phone) {
        await sendLocationSms(contact.phone, t('checkIn.smsBody'), t('checkIn.smsBodyNoLocation'));
      }
      // Only clear if this timer is still the active one (guards against a
      // stale timeout firing after the user already started a new timer).
      setActive((current) => (current?.endsAt === endsAt ? null : current));
      setAutoSentNotice(true);
      autoSentNoticeTimeoutRef.current = setTimeout(() => setAutoSentNotice(false), 6000);
    },
    [t],
  );

  const handleStart = useCallback(
    async (minutes: number) => {
      const contact = await getTrustedContact();
      if (!contact || !contact.phone) {
        Alert.alert(t('sos.noContactTitle'), t('sos.noContactMessage'));
        return;
      }

      const endsAt = Date.now() + minutes * 60 * 1000;

      let notificationId = '';
      try {
        notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: t('checkIn.notificationTitle'),
            body: t('checkIn.notificationBody'),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: minutes * 60,
          },
        });
      } catch {
        // The local notification is a best-effort nudge — the countdown +
        // timeout below are what actually drive the automatic SMS.
      }

      clearTimers();
      setAutoSentNotice(false);
      setActive({ endsAt, notificationId });
      setRemainingSec(minutes * 60);

      timeoutRef.current = setTimeout(() => {
        handleAutoSend(endsAt);
      }, minutes * 60 * 1000);

      intervalRef.current = setInterval(() => {
        setRemainingSec((prev) => Math.max(0, prev - 1));
      }, 1000);
    },
    [clearTimers, handleAutoSend, t],
  );

  const handleImBack = useCallback(() => {
    if (active?.notificationId) {
      Notifications.cancelScheduledNotificationAsync(active.notificationId).catch(() => {});
    }
    clearTimers();
    setActive(null);
    setAutoSentNotice(false);
  }, [active, clearTimers]);

  function formatRemaining(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.hint}>{t('checkIn.hint')}</Text>

      {active ? (
        <>
          <Text style={styles.remaining}>{formatRemaining(remainingSec)}</Text>
          <Pressable style={styles.imBackButton} onPress={handleImBack}>
            <Text style={styles.imBackText}>{t('checkIn.imBack')}</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.durationRow}>
          {DURATION_OPTIONS_MIN.map((minutes) => (
            <Pressable
              key={minutes}
              style={styles.durationButton}
              onPress={() => handleStart(minutes)}
            >
              <Text style={styles.durationText}>
                {t('checkIn.minutes').replace('{n}', String(minutes))}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {autoSentNotice && <Text style={styles.autoSentNotice}>{t('checkIn.autoSentNotice')}</Text>}
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
  durationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  durationButton: {
    flex: 1,
    backgroundColor: colors.safe,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  durationText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  remaining: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  imBackButton: {
    backgroundColor: colors.safe,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  imBackText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  autoSentNotice: {
    color: colors.risk,
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
});
