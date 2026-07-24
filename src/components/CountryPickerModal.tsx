import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import type { EmergencyEmbassy } from '../lib/remoteData';

type Props = {
  visible: boolean;
  embassies: EmergencyEmbassy[];
  onClose: () => void;
  onSelect: (id: string) => void;
};

export default function CountryPickerModal({ visible, embassies, onClose, onSelect }: Props) {
  const { t } = useLanguage();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('common.selectCountry')}</Text>
          <FlatList
            data={embassies}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => onSelect(item.id)}>
                <Text style={styles.rowText}>{item.country_en}</Text>
              </Pressable>
            )}
          />
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: {
    color: colors.text,
    fontSize: 15,
  },
  close: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
