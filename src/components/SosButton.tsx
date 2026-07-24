import { useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { getTrustedContact } from '../lib/storage';
import { sendLocationSms } from '../lib/locationSms';

function callNumber(phone: string) {
  // tel: calls use the cellular voice network, not internet data, so this
  // still works offline — the catch just guards against edge cases.
  Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
}

export default function SosButton() {
  const { t } = useLanguage();
  const navigation = useNavigation();
  const [visible, setVisible] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleCall112() {
    setVisible(false);
    callNumber('112');
  }

  async function handleSmsTrustedContact() {
    const contact = await getTrustedContact();
    if (!contact || !contact.phone) {
      setVisible(false);
      Alert.alert(t('sos.noContactTitle'), t('sos.noContactMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sos.goToProfile'),
          onPress: () => navigation.navigate('Profile' as never),
        },
      ]);
      return;
    }

    setSending(true);
    const result = await sendLocationSms(contact.phone, t('sos.smsBody'), t('sos.smsBodyNoLocation'));
    setSending(false);
    setVisible(false);

    if (result === 'unavailable') {
      Alert.alert(t('sos.smsFailedTitle'), t('sos.smsFailedMessage'));
    }
  }

  return (
    <>
      <Pressable style={styles.fab} onPress={() => setVisible(true)}>
        <Ionicons name="alert-circle" size={24} color={colors.white} />
        <Text style={styles.fabText}>SOS</Text>
      </Pressable>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>{t('sos.title')}</Text>
            <Text style={styles.subtitle}>{t('sos.subtitle')}</Text>

            <Pressable style={[styles.actionButton, styles.callButton]} onPress={handleCall112}>
              <Ionicons name="call" size={20} color={colors.white} />
              <Text style={styles.actionText}>{t('sos.call112')}</Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.smsButton]}
              onPress={handleSmsTrustedContact}
              disabled={sending}
            >
              <Ionicons name="chatbubble-ellipses" size={20} color={colors.white} />
              <Text style={styles.actionText}>{t('sos.smsContact')}</Text>
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={() => setVisible(false)}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 92,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.risk,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
    marginBottom: 12,
  },
  callButton: {
    backgroundColor: colors.risk,
  },
  smsButton: {
    backgroundColor: colors.safe,
  },
  actionText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
