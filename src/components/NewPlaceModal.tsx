import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { submitPlaceSubmission, PLACE_SUBMISSION_CATEGORIES } from '../lib/placeSubmissions';
import type { PlaceSubmissionCategory, PlaceSubmissionKind } from '../lib/placeSubmissions';
import { useAccountPrompt } from '../auth/useAccountPrompt';

type Props = {
  visible: boolean;
  lat: number;
  lng: number;
  onClose: () => void;
  onSubmitted: () => void;
  onLimitReached: () => void;
};

const MAX_COMMENT = 500;

const CATEGORY_ICONS: Record<PlaceSubmissionCategory, keyof typeof Ionicons.glyphMap> = {
  auto: 'car-sport',
  taxi: 'car',
  shop: 'storefront',
  restaurant: 'restaurant',
  bar: 'beer',
  exchange: 'cash',
  street: 'walk',
  school: 'school',
  atm: 'cash',
  pharmacy: 'medkit',
  other: 'location',
};

const CATEGORY_LABEL_KEYS: Record<PlaceSubmissionCategory, string> = {
  auto: 'newPlace.categoryAuto',
  taxi: 'newPlace.categoryTaxi',
  shop: 'newPlace.categoryShop',
  restaurant: 'newPlace.categoryRestaurant',
  bar: 'newPlace.categoryBar',
  exchange: 'newPlace.categoryExchange',
  street: 'newPlace.categoryStreet',
  school: 'newPlace.categorySchool',
  atm: 'newPlace.categoryAtm',
  pharmacy: 'newPlace.categoryPharmacy',
  other: 'newPlace.categoryOther',
};

export default function NewPlaceModal({ visible, lat, lng, onClose, onSubmitted, onLimitReached }: Props) {
  const { t } = useLanguage();
  const { requireAccount } = useAccountPrompt();
  const [kind, setKind] = useState<PlaceSubmissionKind | null>(null);
  const [category, setCategory] = useState<PlaceSubmissionCategory | null>(null);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setKind(null);
    setCategory(null);
    setComment('');
    setPhoto(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Swipe-down-to-dismiss. The sheet holds a text field and tappable chips, so
  // the gesture only activates after 15px of downward movement and gives up
  // entirely on upward movement — a tap on a star or a chip never turns into
  // a drag. Below the threshold the sheet springs back where it was.
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible, translateY]);

  // runOnJS needs a plain JS closure it can turn into a remote function.
  // Passing `Keyboard.dismiss` straight in fails at runtime — the worklet runs
  // on the UI thread, where the `Keyboard` native module doesn't exist, so the
  // property read throws before runOnJS ever gets called.
  const dismissKeyboard = () => Keyboard.dismiss();

  const dragGesture = Gesture.Pan()
    .activeOffsetY(15)
    .failOffsetY(-15)
    .onStart(() => {
      runOnJS(dismissKeyboard)();
    })
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      // A short flick counts as much as a long slow drag, matching how every
      // native sheet behaves.
      if (e.translationY > 120 || e.velocityY > 800) {
        translateY.value = withTiming(600, { duration: 180 }, () => {
          runOnJS(handleClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('review.permTitle'), t('review.permCamera'));
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.4,
      allowsEditing: true,
    });
    if (!res.canceled) setPhoto(res.assets[0]);
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('review.permTitle'), t('review.permLibrary'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.4,
      allowsEditing: true,
    });
    if (!res.canceled) setPhoto(res.assets[0]);
  };

  const handleSubmit = async () => {
    if (!kind) {
      Alert.alert(t('newPlace.needTypeTitle'), t('newPlace.needType'));
      return;
    }
    if (!category) {
      Alert.alert(t('newPlace.needCategoryTitle'), t('newPlace.needCategory'));
      return;
    }
    if (!photo) {
      Alert.alert(t('newPlace.needPhotoTitle'), t('newPlace.needPhoto'));
      return;
    }
    if (!comment.trim()) {
      Alert.alert(t('newPlace.needDescriptionTitle'), t('newPlace.needDescription'));
      return;
    }
    if (requireAccount()) return;
    setSubmitting(true);
    const result = await submitPlaceSubmission({
      lat,
      lng,
      category,
      kind,
      // Kept for the legacy column; warning reports do not ask the user to
      // rate a place because their photo, text and pin are the report itself.
      rating: 1,
      comment,
      photoBase64: photo.base64 ?? '',
      photoMimeType: photo.mimeType,
    });
    setSubmitting(false);
    if (result === 'submitted') {
      Alert.alert(t('newPlace.submittedTitle'), t('newPlace.submittedBody'), [
        { text: t('review.close'), onPress: () => { reset(); onSubmitted(); } },
      ]);
    } else if (result === 'limit_reached') {
      reset();
      onLimitReached();
    } else {
      Alert.alert(t('review.errorTitle'), t('review.error'));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.keyboardWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Tapping the dimmed backdrop closes the keyboard — otherwise there
            was no way to dismiss it once the comment field was focused
            (device report: keyboard stuck open). */}
        <Pressable style={styles.overlay} onPress={Keyboard.dismiss}>
        <GestureDetector gesture={dragGesture}>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          {/* Grab bar — the affordance that tells the tourist the sheet can be
              pulled down, and the reason the gesture is discoverable at all. */}
          <View style={styles.grabber} />
          <Text style={styles.title}>{t('newPlace.title')}</Text>
          <Text style={styles.coords}>
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </Text>

          <Text style={styles.sectionLabel}>{t('newPlace.chooseType')}</Text>
          <View style={styles.typeRow}>
            <Pressable
              style={[styles.typeButton, styles.positiveType, kind === 'positive' && styles.typeButtonActive]}
              onPress={() => setKind('positive')}
            >
              <Ionicons name="thumbs-up" size={18} color={colors.safe} />
              <View style={styles.typeCopy}>
                <Text style={styles.typeTitle}>{t('newPlace.positiveType')}</Text>
                <Text style={styles.typeDescription}>{t('newPlace.positiveTypeDescription')}</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.typeButton, styles.alertType, kind === 'alert' && styles.typeButtonActive]}
              onPress={() => setKind('alert')}
            >
              <Ionicons name="warning" size={18} color={colors.risk} />
              <View style={styles.typeCopy}>
                <Text style={styles.typeTitle}>{t('newPlace.alertType')}</Text>
                <Text style={styles.typeDescription}>{t('newPlace.alertTypeDescription')}</Text>
              </View>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>{kind === 'positive' ? t('newPlace.whatIsPositive') : t('newPlace.whatIsThis')}</Text>
          <View style={styles.categoryRow}>
            {PLACE_SUBMISSION_CATEGORIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.categoryChip, category === c && styles.categoryChipActive]}
                onPress={() => setCategory(c)}
              >
                <Ionicons
                  name={CATEGORY_ICONS[c]}
                  size={16}
                  color={category === c ? colors.background : colors.text}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    category === c && styles.categoryChipTextActive,
                  ]}
                >
                  {t(CATEGORY_LABEL_KEYS[c])}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={(v) => setComment(v.slice(0, MAX_COMMENT))}
            placeholder={kind === 'positive' ? t('newPlace.positivePlaceholder') : t('newPlace.warningPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={Keyboard.dismiss}
          />
          <Pressable style={styles.dismissKeyboardButton} onPress={Keyboard.dismiss} hitSlop={6}>
            <Ionicons name="chevron-down-circle" size={16} color={colors.textMuted} />
            <Text style={styles.dismissKeyboardText}>{t('review.doneTyping')}</Text>
          </Pressable>

          {photo ? (
            <View style={styles.photoRow}>
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} contentFit="cover" />
              <Pressable style={styles.removePhoto} onPress={() => setPhoto(null)} hitSlop={6}>
                <Ionicons name="close-circle" size={24} color={colors.risk} />
                <Text style={styles.removePhotoText}>{t('review.removePhoto')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoButtons}>
              <Pressable style={styles.photoButton} onPress={pickFromCamera}>
                <Ionicons name="camera" size={18} color={colors.text} />
                <Text style={styles.photoButtonText}>{t('review.takePhoto')}</Text>
              </Pressable>
              <Pressable style={styles.photoButton} onPress={pickFromLibrary}>
                <Ionicons name="images" size={18} color={colors.text} />
                <Text style={styles.photoButtonText}>{t('review.choosePhoto')}</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.moderationNote}>{kind === 'positive' ? t('newPlace.positiveModerationNote') : t('newPlace.moderationNote')}</Text>

          <Pressable
            style={[styles.submit, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.submitText}>{kind === 'positive' ? t('newPlace.positiveSubmit') : t('newPlace.submit')}</Text>
            )}
          </Pressable>
          <Pressable style={styles.cancel} onPress={handleClose} disabled={submitting}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </Animated.View>
        </GestureDetector>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardWrapper: {
    flex: 1,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  typeRow: {
    gap: 8,
    marginBottom: 16,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
  },
  positiveType: { borderColor: `${colors.safe}99`, backgroundColor: `${colors.safe}12` },
  alertType: { borderColor: `${colors.risk}99`, backgroundColor: `${colors.risk}12` },
  typeButtonActive: { borderWidth: 2 },
  typeCopy: { flex: 1 },
  typeTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  typeDescription: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  categoryChipActive: {
    backgroundColor: colors.safe,
    borderColor: colors.safe,
  },
  categoryChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: colors.background,
  },
  dismissKeyboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: -8,
    marginBottom: 12,
    padding: 4,
  },
  dismissKeyboardText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
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
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: -8,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  coords: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 14,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
  },
  photoButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  removePhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  removePhotoText: {
    color: colors.risk,
    fontSize: 14,
    fontWeight: '600',
  },
  moderationNote: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 14,
  },
  submit: {
    backgroundColor: colors.safe,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
