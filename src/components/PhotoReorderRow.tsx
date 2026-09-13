import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { selectFeedback } from '../lib/haptics';

// Five thumbs plus gaps must fit inside the form card on a 375pt screen.
const THUMB = 56;
const GAP = 8;
const SLOT = THUMB + GAP;
const HOLD_TO_MOVE_MS = 350;

type Props<T> = {
  /** Photos in display order; index 0 is the cover. */
  photos: T[];
  /** How to show one item — a data: URI for a freshly picked base64, a public URL for a stored one. */
  uriOf: (photo: T) => string;
  onChange: (photos: T[]) => void;
};

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Selected photos as a row of thumbnails. Hold one and drag sideways to
 * change its position — the first slot is the cover picture. Each thumb
 * carries its own × to remove it.
 */
export default function PhotoReorderRow<T>({ photos, uriOf, onChange }: Props<T>) {
  const { t } = useLanguage();
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    onChange(moveItem(photos, from, to));
  };
  const remove = (index: number) => onChange(photos.filter((_, i) => i !== index));

  return (
    <View>
      <View style={styles.row}>
        {photos.map((photo, index) => (
          <DraggableThumb
            key={`${index}-${uriOf(photo).slice(-32)}`}
            uri={uriOf(photo)}
            index={index}
            count={photos.length}
            isCover={index === 0}
            onMove={reorder}
            onRemove={() => remove(index)}
          />
        ))}
      </View>
      {photos.length > 1 && <Text style={styles.hint}>{t('rentals.reorderHint')}</Text>}
    </View>
  );
}

type ThumbProps = {
  uri: string;
  index: number;
  count: number;
  isCover: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
};

function DraggableThumb({ uri, index, count, isCover, onMove, onRemove }: ThumbProps) {
  const translateX = useSharedValue(0);
  const dragging = useSharedValue(0);

  // Locally-declared closures for runOnJS — the safe pattern used by DraggableFab.
  const buzz = () => selectFeedback();
  const finish = (dx: number) => {
    const target = Math.min(count - 1, Math.max(0, index + Math.round(dx / SLOT)));
    onMove(index, target);
  };

  const drag = Gesture.Pan()
    .activateAfterLongPress(HOLD_TO_MOVE_MS)
    .onStart(() => {
      dragging.value = withTiming(1, { duration: 120 });
      runOnJS(buzz)();
    })
    .onUpdate((e) => {
      const minX = -index * SLOT;
      const maxX = (count - 1 - index) * SLOT;
      translateX.value = Math.min(maxX, Math.max(minX, e.translationX));
    })
    .onEnd(() => {
      const dx = translateX.value;
      dragging.value = withTiming(0, { duration: 120 });
      translateX.value = withSpring(0, { damping: 18 });
      runOnJS(finish)(dx);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: withSpring(1 + dragging.value * 0.1, { damping: 14 }) },
    ],
    zIndex: dragging.value > 0 ? 10 : 1,
    opacity: 1 - dragging.value * 0.15,
  }));

  return (
    <GestureDetector gesture={drag}>
      <Animated.View style={[styles.thumbWrap, animatedStyle]}>
        <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
        {isCover && (
          <View style={styles.coverBadge}>
            <Ionicons name="star" size={10} color={colors.white} />
          </View>
        )}
        <Pressable style={styles.remove} hitSlop={6} onPress={onRemove} accessibilityRole="button">
          <Ionicons name="close" size={12} color={colors.white} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP },
  thumbWrap: { width: THUMB, height: THUMB, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.background },
  thumb: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.safe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
});
