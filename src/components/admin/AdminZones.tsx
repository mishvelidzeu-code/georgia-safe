import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { fetchRiskZones, riskZoneComment } from '../../lib/riskZones';
import type { RiskZone } from '../../lib/riskZones';
import RiskZoneModal from './RiskZoneModal';
import type { RiskZoneTarget } from './RiskZoneModal';

const LEVEL_COLORS: Record<RiskZone['level'], string> = { orange: colors.warning, red: colors.risk };

/**
 * Every currently active risk zone, newest expiry last. New zones are created
 * from the map (long-press) because they need a point on it; here the admin
 * can review, edit and delete what is live. Expired zones are not listed —
 * they are already invisible to tourists and simply age out of the table.
 */
export default function AdminZones() {
  const { t, language } = useLanguage();
  const [zones, setZones] = useState<RiskZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<RiskZoneTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setZones(await fetchRiskZones());
    } catch {
      setZones([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 32 }} color={colors.text} />;
  }

  return (
    <>
      <FlatList
        style={s.list}
        contentContainerStyle={s.listContent}
        data={zones}
        keyExtractor={(zone) => zone.id}
        onRefresh={load}
        refreshing={loading}
        ListHeaderComponent={<Text style={s.cardMeta}>{t('riskZone.createHint')}</Text>}
        ListEmptyComponent={<Text style={s.empty}>{t('riskZone.none')}</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.row}>
              <View style={[s.badge, { backgroundColor: LEVEL_COLORS[item.level] }]}>
                <Text style={s.badgeText}>{t(`riskZone.${item.level}`)}</Text>
              </View>
              <Text style={s.cardMeta}>{item.radiusM} m</Text>
            </View>
            <Text style={s.cardBody}>{riskZoneComment(item, language)}</Text>
            <Text style={s.cardMeta}>
              {t('riskZone.currentExpiry').replace('{time}', new Date(item.expiresAt).toLocaleString())}
            </Text>
            <Pressable style={[s.button, s.buttonNeutral]} onPress={() => setTarget({ mode: 'edit', zone: item })}>
              <Ionicons name="create" size={16} color={colors.white} />
              <Text style={s.buttonText}>{t('admin.edit')}</Text>
            </Pressable>
          </View>
        )}
      />
      <RiskZoneModal
        target={target}
        onClose={() => setTarget(null)}
        onSaved={() => {
          setTarget(null);
          void load();
        }}
      />
    </>
  );
}
