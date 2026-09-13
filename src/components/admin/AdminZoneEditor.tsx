import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { updateZone } from '../../lib/admin';
import type { Zone } from '../../lib/remoteData';

type Props = {
  zone: Zone;
  onSaved: () => void;
};

const toLines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);

/**
 * Edits a zone's day/night scores and its tips from the map. Zones can't be
 * deleted — see AdminZones for why.
 */
export default function AdminZoneEditor({ zone, onSaved }: Props) {
  const { t } = useLanguage();
  const [day, setDay] = useState(String(zone.day_score));
  const [night, setNight] = useState(String(zone.night_score));
  const [tipsEn, setTipsEn] = useState(zone.tips_en.join('\n'));
  const [tipsKa, setTipsKa] = useState(zone.tips_ka.join('\n'));
  const [tipsRu, setTipsRu] = useState(zone.tips_ru.join('\n'));
  const [busy, setBusy] = useState(false);

  const save = useCallback(async () => {
    const dayScore = Number(day);
    const nightScore = Number(night);
    if (!Number.isFinite(dayScore) || !Number.isFinite(nightScore) || dayScore < 0 || dayScore > 100 || nightScore < 0 || nightScore > 100) {
      Alert.alert(t('admin.invalidTitle'), t('admin.invalidScore'));
      return;
    }
    setBusy(true);
    const ok = await updateZone({
      id: zone.id,
      day_score: Math.round(dayScore),
      night_score: Math.round(nightScore),
      tips_en: toLines(tipsEn),
      tips_ka: toLines(tipsKa),
      tips_ru: toLines(tipsRu),
    });
    setBusy(false);
    if (!ok) {
      Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
      return;
    }
    onSaved();
  }, [day, night, onSaved, t, tipsEn, tipsKa, tipsRu, zone.id]);

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{zone.name_en}</Text>
      <View style={s.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.label}>{t('admin.dayScore')}</Text>
          <TextInput style={s.input} value={day} keyboardType="number-pad" onChangeText={setDay} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.label}>{t('admin.nightScore')}</Text>
          <TextInput style={s.input} value={night} keyboardType="number-pad" onChangeText={setNight} />
        </View>
      </View>
      <Text style={s.label}>{t('admin.tipsEn')}</Text>
      <TextInput style={[s.input, { minHeight: 70 }]} value={tipsEn} multiline onChangeText={setTipsEn} />
      <Text style={s.label}>{t('admin.tipsKa')}</Text>
      <TextInput style={[s.input, { minHeight: 70 }]} value={tipsKa} multiline onChangeText={setTipsKa} />
      <Text style={s.label}>{t('admin.tipsRu')}</Text>
      <TextInput style={[s.input, { minHeight: 70 }]} value={tipsRu} multiline onChangeText={setTipsRu} />
      <Pressable style={[s.button, s.buttonPrimary]} disabled={busy} onPress={() => void save()}>
        <Ionicons name="save" size={16} color={colors.white} />
        <Text style={s.buttonText}>{t('admin.save')}</Text>
      </Pressable>
    </View>
  );
}
