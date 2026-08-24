import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useLanguage } from '../../i18n/LanguageContext';
import AdminSubmissions from './AdminSubmissions';
import AdminSafePlaces from './AdminSafePlaces';
import AdminPlacePhotos from './AdminPlacePhotos';
import AdminPartners from './AdminPartners';
import AdminZones from './AdminZones';
import AdminFeedback from './AdminFeedback';

type Tab = 'submissions' | 'partners' | 'places' | 'photos' | 'zones' | 'feedback';

const TABS: { key: Tab; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'submissions', icon: 'checkmark-done' },
  { key: 'partners', icon: 'car-sport' },
  { key: 'places', icon: 'location' },
  { key: 'photos', icon: 'image' },
  { key: 'zones', icon: 'shield' },
  { key: 'feedback', icon: 'chatbubbles' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Full-screen admin panel, opened from the Profile screen and only rendered
 * for the administrator's account. A modal rather than a navigation route:
 * the app has a single bottom-tab navigator and no stack, so adding a route
 * would mean restructuring navigation for one screen that tourists never see.
 */
export default function AdminPanel({ visible, onClose }: Props) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('submissions');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('admin.title')}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {TABS.map(({ key, icon }) => (
            <Pressable
              key={key}
              style={[styles.tab, tab === key && styles.tabActive]}
              onPress={() => setTab(key)}
            >
              <Ionicons
                name={icon}
                size={18}
                color={tab === key ? colors.white : colors.textMuted}
              />
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                {t(`admin.tab_${key}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'submissions' && <AdminSubmissions />}
        {tab === 'partners' && <AdminPartners />}
        {tab === 'places' && <AdminSafePlaces />}
        {tab === 'photos' && <AdminPlacePhotos />}
        {tab === 'zones' && <AdminZones />}
        {tab === 'feedback' && <AdminFeedback />}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  tabActive: {
    backgroundColor: colors.safe,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 10,
  },
  tabTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
});
