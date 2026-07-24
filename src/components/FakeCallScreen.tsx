import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';

type Phase = 'ringing' | 'active';

type Props = {
  visible: boolean;
  callerName: string;
  onEnd: () => void;
};

// Vibration.vibrate pattern: [wait, vibrate, wait, vibrate, ...], repeats
// from the start when the second argument is `true`. Loosely matches the
// ringtone.wav loop cadence (not sample-accurate — not needed for this).
const RING_VIBRATION_PATTERN = [0, 800, 400];

export default function FakeCallScreen({ visible, callerName, onEnd }: Props) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>('ringing');
  const [activeSeconds, setActiveSeconds] = useState(0);
  const player = useAudioPlayer(require('../../assets/sounds/ringtone.wav'));

  useEffect(() => {
    if (!visible) return;
    setPhase('ringing');
    setActiveSeconds(0);
    player.loop = true;
    player.seekTo(0);
    player.play();
    Vibration.vibrate(RING_VIBRATION_PATTERN, true);

    return () => {
      player.pause();
      Vibration.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (phase !== 'active') return;
    const interval = setInterval(() => setActiveSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  function handleAccept() {
    player.pause();
    Vibration.cancel();
    setPhase('active');
  }

  function handleEnd() {
    player.pause();
    Vibration.cancel();
    onEnd();
  }

  function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={handleEnd}>
      <View style={styles.container}>
        <View style={styles.top}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={56} color={colors.textMuted} />
          </View>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.status}>
            {phase === 'ringing' ? t('fakeCall.incoming') : formatDuration(activeSeconds)}
          </Text>
        </View>

        <View style={styles.actions}>
          {phase === 'ringing' ? (
            <>
              <View style={styles.actionColumn}>
                <Pressable style={[styles.circleButton, styles.declineButton]} onPress={handleEnd}>
                  <Ionicons
                    name="call"
                    size={28}
                    color={colors.white}
                    style={styles.declineIcon}
                  />
                </Pressable>
                <Text style={styles.actionLabel}>{t('fakeCall.decline')}</Text>
              </View>
              <View style={styles.actionColumn}>
                <Pressable style={[styles.circleButton, styles.acceptButton]} onPress={handleAccept}>
                  <Ionicons name="call" size={28} color={colors.white} />
                </Pressable>
                <Text style={styles.actionLabel}>{t('fakeCall.accept')}</Text>
              </View>
            </>
          ) : (
            <View style={styles.actionColumn}>
              <Pressable style={[styles.circleButton, styles.declineButton]} onPress={handleEnd}>
                <Ionicons name="call" size={28} color={colors.white} style={styles.declineIcon} />
              </Pressable>
              <Text style={styles.actionLabel}>{t('fakeCall.endCall')}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    paddingTop: 100,
    paddingBottom: 60,
  },
  top: {
    alignItems: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  callerName: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 8,
  },
  status: {
    color: colors.textMuted,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 60,
  },
  actionColumn: {
    alignItems: 'center',
    gap: 10,
  },
  circleButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: colors.safe,
  },
  declineButton: {
    backgroundColor: colors.risk,
  },
  declineIcon: {
    transform: [{ rotate: '135deg' }],
  },
  actionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
