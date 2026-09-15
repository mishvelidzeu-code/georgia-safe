import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  RISK_ZONE_RADII,
  RISK_ZONE_SIZES,
  createRiskZone,
  deleteRiskZone,
  sizeForRadius,
  updateRiskZone,
} from '../../lib/riskZones';
import type { RiskLevel, RiskZone, RiskZoneSize } from '../../lib/riskZones';

/** Create around a long-pressed point, or edit an existing circle. */
export type RiskZoneTarget =
  | { mode: 'create'; lat: number; lng: number }
  | { mode: 'edit'; zone: RiskZone };

type Props = {
  target: RiskZoneTarget | null;
  onClose: () => void;
  /** A zone was created, changed or deleted — the map must re-fetch. */
  onSaved: () => void;
};

const LEVELS: RiskLevel[] = ['orange', 'red'];
const LEVEL_COLORS: Record<RiskLevel, string> = { orange: colors.warning, red: colors.risk };

// Preset durations, in hours. "custom" lets the admin type any number.
const DURATION_PRESETS = [
  { key: 'h3', hours: 3 },
  { key: 'h6', hours: 6 },
  { key: 'h12', hours: 12 },
  { key: 'd1', hours: 24 },
  { key: 'd2', hours: 48 },
  { key: 'd7', hours: 168 },
] as const;
const MAX_CUSTOM_HOURS = 24 * 30;

/** Used when the inset hook reports 0 (e.g. Android without edge-to-edge). */
const MIN_TOP_INSET = 24;

/**
 * Administrator form for a risk zone. Colour and duration are deliberately
 * NOT preselected: an orange 3-hour circle and a red 7-day one are different
 * decisions, and neither should happen by tapping Save too quickly. Size
 * defaults to medium, the common case.
 */
export default function RiskZoneModal({ target, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [level, setLevel] = useState<RiskLevel | null>(null);
  const [size, setSize] = useState<RiskZoneSize>('medium');
  const [presetHours, setPresetHours] = useState<number | null>(null);
  const [customHours, setCustomHours] = useState('');
  const [commentEn, setCommentEn] = useState('');
  const [commentKa, setCommentKa] = useState('');
  const [commentRu, setCommentRu] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset per target so a second long-press never inherits the last form.
  useEffect(() => {
    if (!target) return;
    if (target.mode === 'edit') {
      setLevel(target.zone.level);
      setSize(sizeForRadius(target.zone.radiusM));
      setCommentEn(target.zone.comment_en);
      setCommentKa(target.zone.comment_ka);
      setCommentRu(target.zone.comment_ru);
    } else {
      setLevel(null);
      setSize('medium');
      setCommentEn('');
      setCommentKa('');
      setCommentRu('');
    }
    setPresetHours(null);
    setCustomHours('');
  }, [target]);

  const chosenHours = (() => {
    if (presetHours !== null) return presetHours;
    const custom = Number(customHours);
    return Number.isFinite(custom) && custom > 0 ? Math.min(custom, MAX_CUSTOM_HOURS) : null;
  })();

  const save = useCallback(async () => {
    if (!target) return;
    if (!level) {
      Alert.alert(t('admin.invalidTitle'), t('riskZone.needLevel'));
      return;
    }
    if (!commentEn.trim() && !commentKa.trim() && !commentRu.trim()) {
      Alert.alert(t('admin.invalidTitle'), t('riskZone.needComment'));
      return;
    }
    // Creating needs a duration; editing may keep the existing expiry.
    if (target.mode === 'create' && chosenHours === null) {
      Alert.alert(t('admin.invalidTitle'), t('riskZone.needDuration'));
      return;
    }
    setBusy(true);
    const ok =
      target.mode === 'create'
        ? await createRiskZone({
            level,
            lat: target.lat,
            lng: target.lng,
            radiusM: RISK_ZONE_RADII[size],
            comment_en: commentEn,
            comment_ka: commentKa,
            comment_ru: commentRu,
            durationHours: chosenHours ?? 0,
          })
        : await updateRiskZone(target.zone.id, {
            level,
            radiusM: RISK_ZONE_RADII[size],
            comment_en: commentEn,
            comment_ka: commentKa,
            comment_ru: commentRu,
            ...(chosenHours !== null && { durationHours: chosenHours }),
          });
    setBusy(false);
    if (!ok) {
      Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
      return;
    }
    onSaved();
  }, [chosenHours, commentEn, commentKa, commentRu, level, onSaved, size, t, target]);

  const remove = useCallback(() => {
    if (!target || target.mode !== 'edit') return;
    Alert.alert(t('riskZone.delete'), t('riskZone.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('riskZone.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const ok = await deleteRiskZone(target.zone.id);
          setBusy(false);
          if (!ok) {
            Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
            return;
          }
          onSaved();
        },
      },
    ]);
  }, [onSaved, t, target]);

  const expiresLabel =
    target?.mode === 'edit' ? new Date(target.zone.expiresAt).toLocaleString() : null;

  return (
    <Modal visible={target !== null} animationType="slide" onRequestClose={onClose}>
      {/* Insets applied from the hook: safe-area-context's SafeAreaView gets none inside a RN Modal. */}
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, MIN_TOP_INSET) + 12 }]}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>{t('admin.title')}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {t(target?.mode === 'edit' ? 'riskZone.editTitle' : 'riskZone.newTitle')}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 48 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.card}>
            <Text style={s.label}>{t('riskZone.level')}</Text>
            <View style={s.row}>
              {LEVELS.map((candidate) => {
                const active = level === candidate;
                return (
                  <Pressable
                    key={candidate}
                    style={[
                      s.chip,
                      styles.levelChip,
                      active && { backgroundColor: LEVEL_COLORS[candidate], borderColor: LEVEL_COLORS[candidate] },
                    ]}
                    onPress={() => setLevel(candidate)}
                  >
                    <View style={[styles.levelDot, { backgroundColor: LEVEL_COLORS[candidate] }, active && styles.levelDotActive]} />
                    <Text style={[s.chipText, active && s.chipTextActive]}>{t(`riskZone.${candidate}`)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.label}>{t('riskZone.size')}</Text>
            <View style={s.row}>
              {RISK_ZONE_SIZES.map((candidate) => {
                const active = size === candidate;
                return (
                  <Pressable key={candidate} style={[s.chip, active && s.chipActive]} onPress={() => setSize(candidate)}>
                    <Text style={[s.chipText, active && s.chipTextActive]}>
                      {t(`riskZone.${candidate}`)} · {RISK_ZONE_RADII[candidate]} m
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.label}>{t('riskZone.duration')}</Text>
            {expiresLabel && (
              <Text style={s.cardMeta}>{t('riskZone.currentExpiry').replace('{time}', expiresLabel)}</Text>
            )}
            <View style={styles.wrapRow}>
              {DURATION_PRESETS.map((preset) => {
                const active = presetHours === preset.hours;
                return (
                  <Pressable
                    key={preset.key}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => {
                      setPresetHours(active ? null : preset.hours);
                      setCustomHours('');
                    }}
                  >
                    <Text style={[s.chipText, active && s.chipTextActive]}>{t(`riskZone.${preset.key}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={s.input}
              value={customHours}
              keyboardType="number-pad"
              placeholder={t('riskZone.customHours')}
              placeholderTextColor={colors.textMuted}
              onChangeText={(value) => {
                setCustomHours(value.replace(/[^0-9]/g, ''));
                setPresetHours(null);
              }}
            />

            <Text style={s.label}>{t('riskZone.comment')}</Text>
            <Text style={s.cardMeta}>{t('riskZone.commentHint')}</Text>
            <TextInput
              style={[s.input, styles.commentInput]}
              value={commentEn}
              multiline
              placeholder={t('riskZone.commentEn')}
              placeholderTextColor={colors.textMuted}
              onChangeText={setCommentEn}
            />
            <TextInput
              style={[s.input, styles.commentInput]}
              value={commentKa}
              multiline
              placeholder={t('riskZone.commentKa')}
              placeholderTextColor={colors.textMuted}
              onChangeText={setCommentKa}
            />
            <TextInput
              style={[s.input, styles.commentInput]}
              value={commentRu}
              multiline
              placeholder={t('riskZone.commentRu')}
              placeholderTextColor={colors.textMuted}
              onChangeText={setCommentRu}
            />

            {target?.mode === 'edit' && <Text style={s.cardMeta}>{t('riskZone.dragHint')}</Text>}

            <Pressable style={[s.button, s.buttonPrimary]} disabled={busy} onPress={() => void save()}>
              <Ionicons name="save" size={16} color={colors.white} />
              <Text style={s.buttonText}>{t('common.save')}</Text>
            </Pressable>
            {target?.mode === 'edit' && (
              <Pressable style={[s.button, s.buttonDanger]} disabled={busy} onPress={remove}>
                <Ionicons name="trash" size={16} color={colors.white} />
                <Text style={s.buttonText}>{t('riskZone.delete')}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCopy: { flex: 1 },
  kicker: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 2 },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelDot: { width: 10, height: 10, borderRadius: 5 },
  levelDotActive: { backgroundColor: colors.white },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  commentInput: { minHeight: 60, textAlignVertical: 'top' },
});
