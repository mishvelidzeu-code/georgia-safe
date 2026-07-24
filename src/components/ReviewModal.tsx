import { useState } from 'react';
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
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { submitPlaceReview } from '../lib/placeReviews';
import type { PlaceReviewType } from '../lib/placeReviews';

type Props = {
  visible: boolean;
  placeId: string;
  placeType: PlaceReviewType;
  placeName: string;
  onClose: () => void;
};

const MAX_COMMENT = 500;

export default function ReviewModal({ visible, placeId, placeType, placeName, onClose }: Props) {
  const { t } = useLanguage();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setRating(0);
    setComment('');
    setPhoto(null);
    setSubmitting(false);
    setDone(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

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
    if (rating < 1) {
      Alert.alert(t('review.needRatingTitle'), t('review.needRating'));
      return;
    }
    setSubmitting(true);
    const ok = await submitPlaceReview({
      placeId,
      placeType,
      placeName,
      rating,
      comment,
      photoBase64: photo?.base64 ?? undefined,
      photoMimeType: photo?.mimeType,
    });
    setSubmitting(false);
    if (ok) {
      setDone(true);
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
        {/* Tapping anywhere outside the sheet (the dimmed backdrop) closes the
            keyboard — otherwise there was no way to dismiss it once the
            comment field was focused (device report: keyboard stuck open). */}
        <Pressable style={styles.overlay} onPress={Keyboard.dismiss}>
        <View style={styles.sheet}>
          {done ? (
            <View style={styles.doneBox}>
              <Ionicons name="checkmark-circle" size={48} color={colors.safe} />
              <Text style={styles.doneText}>{t('review.thanks')}</Text>
              <Pressable style={styles.submit} onPress={handleClose}>
                <Text style={styles.submitText}>{t('review.close')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{t('review.title')}</Text>
              <Text style={styles.placeName}>{placeName}</Text>

              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                    <Ionicons
                      name={n <= rating ? 'star' : 'star-outline'}
                      size={36}
                      color={n <= rating ? '#f59e0b' : colors.textMuted}
                    />
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={styles.input}
                value={comment}
                onChangeText={(v) => setComment(v.slice(0, MAX_COMMENT))}
                placeholder={t('review.commentPlaceholder')}
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

              <Text style={styles.anonNote}>{t('review.anonymousNote')}</Text>

              <Pressable
                style={[styles.submit, submitting && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.submitText}>{t('review.submit')}</Text>
                )}
              </Pressable>
              <Pressable style={styles.cancel} onPress={handleClose} disabled={submitting}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </Pressable>
            </>
          )}
        </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardWrapper: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
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
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  placeName: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 2,
    marginBottom: 14,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
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
  anonNote: {
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
  doneBox: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  doneText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
