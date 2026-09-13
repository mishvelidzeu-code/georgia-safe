import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { cityName } from '../lib/cities';
import CityPickerModal from './CityPickerModal';

type Props = {
  /** Current value in any spelling, or empty/null for nothing chosen. */
  value: string | null;
  onChange: (cityEn: string | null) => void;
  /** Offer an "All cities" row (filters) rather than forcing a choice (forms). */
  allowAll?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A form field that opens the city list on tap — the only way to enter a city. */
export default function CitySelect({ value, onChange, allowAll = false, style }: Props) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const label = value ? cityName(value, language) : allowAll ? t('common.allCities') : t('common.selectCity');

  return (
    <>
      <Pressable
        style={[styles.field, style]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('common.selectCity')}
      >
        <Ionicons name="location-outline" size={16} color={value ? colors.text : colors.textMuted} />
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>{label}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>
      <CityPickerModal
        visible={open}
        selected={value}
        allowAll={allowAll}
        onClose={() => setOpen(false)}
        onSelect={(city) => {
          onChange(city);
          setOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  value: { flex: 1, color: colors.text, fontSize: 13 },
  placeholder: { color: colors.textMuted },
});
