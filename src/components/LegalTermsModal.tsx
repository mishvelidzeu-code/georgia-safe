import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { APPLE_STANDARD_EULA_URL, PRIVACY_POLICY_URL, openLegalUrl } from '../lib/legal';

/** Used when the inset hook reports 0 (e.g. Android without edge-to-edge). */
const MIN_TOP_INSET = 24;

type Props = {
  visible: boolean;
  onClose: () => void;
};

const SECTIONS = [
  'agreement',
  'services',
  'emergency',
  'sms',
  'location',
  'reliability',
  'privacy',
] as const;

/**
 * The app-specific terms requested during App Review. These are bundled so a
 * traveller can read the emergency/location limitations even without a data
 * connection. Apple's standard EULA and the full privacy policy remain linked
 * as the authoritative external documents.
 */
export default function LegalTermsModal({ visible, onClose }: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Same as PaywallModal: safe-area-context's SafeAreaView gets no insets
          inside a RN Modal, so they are applied from the hook instead. */}
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, MIN_TOP_INSET) + 12 }]}>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('legal.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        >
          <Text style={styles.updated}>{t('legal.updated')}</Text>

          {SECTIONS.map((section) => (
            <View key={section} style={styles.section}>
              <Text style={styles.sectionTitle}>{t(`legal.${section}Title`)}</Text>
              <Text style={styles.body}>{t(`legal.${section}Body`)}</Text>
            </View>
          ))}

          <Text style={styles.acceptance}>{t('legal.acceptance')}</Text>

          <Pressable
            style={styles.linkButton}
            onPress={() => openLegalUrl(APPLE_STANDARD_EULA_URL)}
          >
            <Ionicons name="open-outline" size={18} color={colors.safe} />
            <Text style={styles.linkText}>{t('legal.standardEula')}</Text>
          </Pressable>
          <Pressable
            style={styles.linkButton}
            onPress={() => openLegalUrl(PRIVACY_POLICY_URL)}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.safe} />
            <Text style={styles.linkText}>{t('premium.privacy')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: { width: 44, minHeight: 44, justifyContent: 'center' },
  headerSpacer: { width: 44 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center', flex: 1 },
  content: { padding: 20 },
  updated: { color: colors.textMuted, fontSize: 12, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 7 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  acceptance: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    marginBottom: 18,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 44,
    marginBottom: 4,
  },
  linkText: { color: colors.safe, fontSize: 14, fontWeight: '700', flex: 1 },
});
