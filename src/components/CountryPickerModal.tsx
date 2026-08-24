import { useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { countryName, searchCountries } from '../lib/countries';
import type { Country } from '../lib/countries';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Receives the ISO 3166-1 alpha-2 code (e.g. "US"). */
  onSelect: (countryCode: string) => void;
};

/**
 * Country picker over the full ISO country list with a search box.
 *
 * Countries with no embassy in Georgia are still selectable — a tourist's
 * nationality shouldn't be limited to the ten countries that happen to have
 * one here — but are labelled so it's clear up front that this app can't
 * point them at an embassy.
 */
export default function CountryPickerModal({ visible, onClose, onSelect }: Props) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchCountries(query), [query]);

  function handleClose() {
    setQuery('');
    Keyboard.dismiss();
    onClose();
  }

  function handleSelect(country: Country) {
    setQuery('');
    Keyboard.dismiss();
    onSelect(country.code);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t('common.selectCountry')}</Text>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t('common.searchCountry')}
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>{t('common.noResults')}</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => handleSelect(item)}>
                <Text style={styles.rowText}>{countryName(item, language)}</Text>
                {!item.embassyId && (
                  <Text style={styles.rowNote}>{t('common.noEmbassy')}</Text>
                )}
              </Pressable>
            )}
          />

          <Pressable style={styles.close} onPress={handleClose}>
            <Text style={styles.closeText}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
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
    height: '80%',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 12,
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
  rowNote: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
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
