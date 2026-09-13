import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { localizedField } from '../../lib/localizeData';
import type { SafePlace, Zone } from '../../lib/remoteData';
import type { PlaceSubmission } from '../../lib/placeSubmissions';
import type { PartnerListing } from '../../lib/rentals';
import AdminSubmissionEditor from './AdminSubmissionEditor';
import AdminSafePlaceEditor from './AdminSafePlaceEditor';
import AdminZoneEditor from './AdminZoneEditor';
import AdminListingEditor from './AdminListingEditor';
import PlacePhotosEditor from './PlacePhotosEditor';

/** Landmarks ship in the app bundle; only their id and names matter here. */
type LandmarkRef = { id: string; name_en: string; name_ka: string; name_ru: string };

/** Everything on the map an administrator can tap "Edit" on. Google POIs are excluded — they aren't ours. */
export type AdminEditTarget =
  | { type: 'submission'; submission: PlaceSubmission }
  | { type: 'place'; place: SafePlace }
  | { type: 'zone'; zone: Zone }
  | { type: 'landmark'; landmark: LandmarkRef }
  | { type: 'partnerListing'; listing: PartnerListing };

type Props = {
  target: AdminEditTarget | null;
  onClose: () => void;
  /** A row was changed or deleted — the map must re-fetch and drop its selection. */
  onSaved: () => void;
  /** Curated photos changed — only the photo cache needs refreshing. */
  onPhotosChanged: () => void;
};

/** Used when the inset hook reports 0 (e.g. Android without edge-to-edge). */
const MIN_TOP_INSET = 24;

/**
 * Full-screen editor opened from the map's info sheet, for the administrator
 * only. It reuses the same data layer as the admin panel, so anything done
 * here is exactly what the panel would have done — just without having to
 * find the row in a list first.
 */
export default function AdminMapEditModal({ target, onClose, onSaved, onPhotosChanged }: Props) {
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();

  const title = (() => {
    if (!target) return '';
    switch (target.type) {
      case 'submission': return t(target.submission.kind === 'alert' ? 'admin.alertReport' : 'admin.positiveReport');
      case 'place': return target.place.name;
      case 'zone': return localizedField(target.zone, 'name', language);
      case 'landmark': return localizedField(target.landmark, 'name', language);
      case 'partnerListing': return target.listing.title;
    }
  })();

  return (
    <Modal visible={target !== null} animationType="slide" onRequestClose={onClose}>
      {/* Insets applied from the hook: safe-area-context's SafeAreaView gets none inside a RN Modal. */}
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, MIN_TOP_INSET) + 12 }]}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>{t('admin.title')}</Text>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 48 }]}
          keyboardShouldPersistTaps="handled"
        >
          {target?.type === 'submission' && <AdminSubmissionEditor submission={target.submission} onSaved={onSaved} />}
          {target?.type === 'place' && <AdminSafePlaceEditor place={target.place} onSaved={onSaved} onPhotosChanged={onPhotosChanged} />}
          {target?.type === 'zone' && <AdminZoneEditor zone={target.zone} onSaved={onSaved} />}
          {target?.type === 'partnerListing' && <AdminListingEditor listing={target.listing} onSaved={onSaved} />}
          {target?.type === 'landmark' && (
            <>
              <Text style={s.cardMeta}>{t('admin.landmarkStatic')}</Text>
              <PlacePhotosEditor placeType="landmark" placeId={target.landmark.id} onChanged={onPhotosChanged} />
            </>
          )}
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
});
