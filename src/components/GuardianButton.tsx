import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import GuardianModal from './GuardianModal';

// Mirrors SosButton's placement (bottom-right) on the opposite corner so
// both floating actions stay reachable from every screen without
// overlapping. Card background instead of a safety color (green/red)
// keeps it visually distinct from the safety-status buttons.
export default function GuardianButton() {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable style={styles.fab} onPress={() => setVisible(true)}>
        <Ionicons name="chatbubble-ellipses" size={22} color={colors.safe} />
        <Text style={styles.fabText}>{t('guardian.fab')}</Text>
      </Pressable>

      <GuardianModal visible={visible} onClose={() => setVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 16,
    bottom: 92,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabText: {
    color: colors.safe,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 1,
  },
});
