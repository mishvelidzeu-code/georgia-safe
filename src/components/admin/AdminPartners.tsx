import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  deleteAdminCar,
  fetchAdminCars,
  fetchAdminPartners,
  setCarApproved,
  setPartnerApproved,
} from '../../lib/admin';
import type { AdminPartner, AdminPendingCar } from '../../lib/admin';

/**
 * The two approval queues that gate the rental marketplace: companies first,
 * then their individual listings. Both are shown here because approving a
 * company is meaningless without seeing what it then tries to publish.
 *
 * A partner can edit an approved car, which a database trigger sends straight
 * back to "waiting" — so this list is the only route to a tourist's screen.
 */
export default function AdminPartners() {
  const { t } = useLanguage();
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [cars, setCars] = useState<AdminPendingCar[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c] = await Promise.allSettled([fetchAdminPartners(), fetchAdminCars()]);
    setPartners(p.status === 'fulfilled' ? p.value : []);
    setCars(c.status === 'fulfilled' ? c.value : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePartner = useCallback(
    async (partner: AdminPartner) => {
      const ok = await setPartnerApproved(partner.id, !partner.approved);
      if (!ok) {
        Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
        return;
      }
      await load();
    },
    [load, t],
  );

  const toggleCar = useCallback(
    async (car: AdminPendingCar) => {
      const ok = await setCarApproved(car.id, !car.approved);
      if (!ok) {
        Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
        return;
      }
      await load();
    },
    [load, t],
  );

  const confirmDeleteCar = useCallback(
    (car: AdminPendingCar) => {
      Alert.alert(t('admin.deleteTitle'), `${car.make} ${car.model}`, [
        { text: t('admin.cancel'), style: 'cancel' },
        {
          text: t('admin.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteAdminCar(car.id);
            await load();
          },
        },
      ]);
    },
    [load, t],
  );

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 32 }} color={colors.text} />;
  }

  return (
    <FlatList
      style={s.list}
      contentContainerStyle={s.listContent}
      data={cars}
      keyExtractor={(car) => car.id}
      onRefresh={load}
      refreshing={loading}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <Text style={s.cardTitle}>{t('admin.partnerAccounts')}</Text>
          {partners.length === 0 ? (
            <Text style={s.cardMeta}>{t('admin.noPartners')}</Text>
          ) : (
            partners.map((partner) => (
              <View key={partner.id} style={s.card}>
                <Text style={s.cardTitle}>{partner.companyName}</Text>
                <Text style={s.cardMeta}>
                  {partner.city} · {partner.phone}
                </Text>
                <View
                  style={[
                    s.badge,
                    { backgroundColor: partner.approved ? colors.safe : colors.warning },
                  ]}
                >
                  <Text style={s.badgeText}>
                    {partner.approved ? t('admin.approved') : t('admin.pending')}
                  </Text>
                </View>
                <Pressable
                  style={[s.button, partner.approved ? s.buttonNeutral : s.buttonPrimary]}
                  onPress={() => void togglePartner(partner)}
                >
                  <Ionicons
                    name={partner.approved ? 'arrow-undo' : 'checkmark'}
                    size={16}
                    color={colors.white}
                  />
                  <Text style={s.buttonText}>
                    {partner.approved ? t('admin.unapprove') : t('admin.approve')}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
          <Text style={[s.cardTitle, { marginTop: 8 }]}>{t('admin.carListings')}</Text>
        </View>
      }
      ListEmptyComponent={<Text style={s.empty}>{t('admin.noCarListings')}</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          {item.photoUrls.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {item.photoUrls.map((url) => (
                <Image
                  key={url}
                  source={{ uri: url }}
                  style={{ width: 140, height: 100, borderRadius: 8, marginRight: 8 }}
                  contentFit="cover"
                />
              ))}
            </ScrollView>
          )}
          <Text style={s.cardTitle}>
            {item.make} {item.model}
          </Text>
          <Text style={s.cardMeta}>
            {item.city}
            {item.pricePerDay !== null ? ` · ${item.pricePerDay}₾` : ''}
          </Text>
          {item.description ? <Text style={s.cardBody}>{item.description}</Text> : null}
          <View
            style={[s.badge, { backgroundColor: item.approved ? colors.safe : colors.warning }]}
          >
            <Text style={s.badgeText}>
              {item.approved ? t('admin.approved') : t('admin.pending')}
            </Text>
          </View>
          <View style={s.row}>
            <Pressable
              style={[s.button, item.approved ? s.buttonNeutral : s.buttonPrimary]}
              onPress={() => void toggleCar(item)}
            >
              <Ionicons
                name={item.approved ? 'arrow-undo' : 'checkmark'}
                size={16}
                color={colors.white}
              />
              <Text style={s.buttonText}>
                {item.approved ? t('admin.unapprove') : t('admin.approve')}
              </Text>
            </Pressable>
            <Pressable style={[s.button, s.buttonDanger]} onPress={() => confirmDeleteCar(item)}>
              <Ionicons name="trash" size={16} color={colors.white} />
              <Text style={s.buttonText}>{t('admin.delete')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}
