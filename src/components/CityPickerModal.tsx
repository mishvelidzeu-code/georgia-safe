import { FlatList, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { CITIES, cityKey } from '../lib/cities';

type Props = {
  visible: boolean;
  /** Current value in any spelling; used only to tick the matching row. */
  selected: string | null;
  /** Adds an "All cities" row at the top that selects null. */
  allowAll?: boolean;
  onClose: () => void;
  /** Receives the canonical English name (e.g. "Tbilisi"), or null for "All cities". */
  onSelect: (cityEn: string | null) => void;
};

/**
 * Picks a city from the fixed list in cities.ts. Replaces free-text city
 * fields everywhere, so a partner's "თბილისი" and a tourist's "Tbilisi" can
 * never drift apart again.
 */
export default function CityPickerModal({ visible, selected, allowAll = false, onClose, onSelect }: Props) {
  const { t, language } = useLanguage();
  const selectedKey = selected ? cityKey(selected) : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t('common.selectCity')}</Text>
          <FlatList
            data={CITIES}
            keyExtractor={(item) => item.key}
            ListHeaderComponent={allowAll ? (
              <Pressable style={styles.row} onPress={() => onSelect(null)}>
                <Text style={[styles.rowText, selectedKey === null && styles.rowTextActive]}>{t('common.allCities')}</Text>
                {selectedKey === null && <Ionicons name="checkmark" size={18} color={colors.safe} />}
              </Pressable>
            ) : null}
            renderItem={({ item }) => {
              const active = item.key === selectedKey;
              return (
                <Pressable style={styles.row} onPress={() => onSelect(item.en)}>
                  <Text style={[styles.rowText, active && styles.rowTextActive]}>{item[language]}</Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.safe} />}
                </Pressable>
              );
            }}
          />
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    height: '70%',
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { color: colors.text, fontSize: 15 },
  rowTextActive: { color: colors.safe, fontWeight: '700' },
  close: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  closeText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
});
