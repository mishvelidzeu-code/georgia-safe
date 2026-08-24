import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { fetchAdminZones, updateZone } from '../../lib/admin';
import type { Zone } from '../../lib/remoteData';

/**
 * Edits the two numbers that drive a zone's colour on the map, plus its tips
 * in all three languages. Zones can't be added or deleted here — their ids are
 * referenced by stored feedback and by the bundled zones.json fallback, so
 * that stays a code change.
 *
 * Tips are edited as one line per tip, which keeps the UI a plain text box
 * while still round-tripping the text[] column faithfully.
 */
export default function AdminZones() {
  const { t } = useLanguage();
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    day: '',
    night: '',
    tipsEn: '',
    tipsKa: '',
    tipsRu: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setZones(await fetchAdminZones());
    } catch {
      setZones([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = useCallback((zone: Zone) => {
    setEditingId(zone.id);
    setDraft({
      day: String(zone.day_score),
      night: String(zone.night_score),
      tipsEn: zone.tips_en.join('\n'),
      tipsKa: zone.tips_ka.join('\n'),
      tipsRu: zone.tips_ru.join('\n'),
    });
  }, []);

  const toLines = (value: string) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const save = useCallback(async () => {
    if (!editingId) return;
    const day = Number(draft.day);
    const night = Number(draft.night);
    if (!Number.isFinite(day) || !Number.isFinite(night) || day < 0 || day > 100 || night < 0 || night > 100) {
      Alert.alert(t('admin.invalidTitle'), t('admin.invalidScore'));
      return;
    }
    const ok = await updateZone({
      id: editingId,
      day_score: Math.round(day),
      night_score: Math.round(night),
      tips_en: toLines(draft.tipsEn),
      tips_ka: toLines(draft.tipsKa),
      tips_ru: toLines(draft.tipsRu),
    });
    if (!ok) {
      Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
      return;
    }
    setEditingId(null);
    await load();
  }, [draft, editingId, load, t]);

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 32 }} color={colors.text} />;
  }

  return (
    <FlatList
      style={s.list}
      contentContainerStyle={s.listContent}
      data={zones}
      keyExtractor={(zone) => zone.id}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<Text style={s.empty}>{t('admin.noZones')}</Text>}
      renderItem={({ item }) => {
        const editing = editingId === item.id;
        return (
          <View style={s.card}>
            <Text style={s.cardTitle}>{item.name_en}</Text>
            {editing ? (
              <>
                <View style={s.row}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.label}>{t('admin.dayScore')}</Text>
                    <TextInput
                      style={s.input}
                      value={draft.day}
                      keyboardType="number-pad"
                      onChangeText={(day) => setDraft((d) => ({ ...d, day }))}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.label}>{t('admin.nightScore')}</Text>
                    <TextInput
                      style={s.input}
                      value={draft.night}
                      keyboardType="number-pad"
                      onChangeText={(night) => setDraft((d) => ({ ...d, night }))}
                    />
                  </View>
                </View>
                <Text style={s.label}>{t('admin.tipsEn')}</Text>
                <TextInput
                  style={[s.input, { minHeight: 70 }]}
                  value={draft.tipsEn}
                  multiline
                  onChangeText={(tipsEn) => setDraft((d) => ({ ...d, tipsEn }))}
                />
                <Text style={s.label}>{t('admin.tipsKa')}</Text>
                <TextInput
                  style={[s.input, { minHeight: 70 }]}
                  value={draft.tipsKa}
                  multiline
                  onChangeText={(tipsKa) => setDraft((d) => ({ ...d, tipsKa }))}
                />
                <Text style={s.label}>{t('admin.tipsRu')}</Text>
                <TextInput
                  style={[s.input, { minHeight: 70 }]}
                  value={draft.tipsRu}
                  multiline
                  onChangeText={(tipsRu) => setDraft((d) => ({ ...d, tipsRu }))}
                />
                <View style={s.row}>
                  <Pressable style={[s.button, s.buttonPrimary]} onPress={() => void save()}>
                    <Ionicons name="save" size={16} color={colors.white} />
                    <Text style={s.buttonText}>{t('admin.save')}</Text>
                  </Pressable>
                  <Pressable
                    style={[s.button, s.buttonNeutral]}
                    onPress={() => setEditingId(null)}
                  >
                    <Text style={s.buttonText}>{t('admin.cancel')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={s.cardMeta}>
                  {t('admin.dayScore')} {item.day_score} · {t('admin.nightScore')}{' '}
                  {item.night_score} · {item.tips_en.length} {t('admin.tipsCount')}
                </Text>
                <Pressable style={[s.button, s.buttonNeutral]} onPress={() => startEdit(item)}>
                  <Ionicons name="create" size={16} color={colors.white} />
                  <Text style={s.buttonText}>{t('admin.edit')}</Text>
                </Pressable>
              </>
            )}
          </View>
        );
      }}
    />
  );
}
