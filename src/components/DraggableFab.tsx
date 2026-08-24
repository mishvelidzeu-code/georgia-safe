import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { getFabOffset, setFabOffset } from '../lib/storage';
import { selectFeedback } from '../lib/haptics';

// How long the tourist must hold before the button detaches. Long enough that
// a normal tap — including a slow, panicked one on SOS — never turns into a
// drag, short enough to feel deliberate rather than broken.
const HOLD_TO_MOVE_MS = 450;

// Keeps a dragged button from being parked half off-screen or under the tab
// bar, where it would be unreachable exactly when it's needed.
const EDGE_MARGIN = 8;
const TAB_BAR_SAFE_ZONE = 60;

type Props = {
  /** Storage key — each button remembers its own position. */
  id: string;
  /** Size of the child, used to clamp the button inside the screen. */
  width: number;
  height: number;
  /** Default corner offsets, matching the button's original fixed placement. */
  anchor: { left?: number; right?: number; bottom: number };
  children: React.ReactNode;
};

/**
 * Wraps a floating action button so the tourist can hold it and drag it
 * anywhere on screen; the position persists across launches.
 *
 * Taps pass straight through to the child: the pan gesture uses
 * `activateAfterLongPress`, so it does not compete with the child's onPress
 * until the hold threshold is crossed. This matters most for SOS — a drag
 * that swallowed the tap would break the app's whole purpose.
 */
export default function DraggableFab({ id, width, height, anchor, children }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(0);
  const [loaded, setLoaded] = useState(false);

  // Restore the saved position before the first paint the tourist notices —
  // rendering at the default corner and then jumping would look like a glitch.
  useEffect(() => {
    let cancelled = false;
    getFabOffset(id).then((saved) => {
      if (cancelled) return;
      if (saved) {
        offsetX.value = saved.x;
        offsetY.value = saved.y;
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, offsetX, offsetY]);

  const persist = (x: number, y: number) => {
    void setFabOffset(id, { x, y });
  };

  // Wrapped in a locally-declared closure rather than passing the imported
  // function straight to runOnJS — the same shape that already works for
  // `persist`, and the safe pattern after the Keyboard.dismiss worklet crash.
  const buzz = () => {
    selectFeedback();
  };

  // Travel limits in each direction, derived from where the button starts.
  // `anchor.left`/`anchor.right` is its resting distance from that edge, so
  // the remaining room on the opposite side is the screen minus that, minus
  // the button's own size.
  const restingLeft = anchor.left ?? screenWidth - (anchor.right ?? 0) - width;
  const minX = -(restingLeft - EDGE_MARGIN);
  const maxX = screenWidth - restingLeft - width - EDGE_MARGIN;
  const maxY = anchor.bottom - TAB_BAR_SAFE_ZONE;
  const minY = -(screenHeight - anchor.bottom - height - EDGE_MARGIN);

  const drag = Gesture.Pan()
    .activateAfterLongPress(HOLD_TO_MOVE_MS)
    .onStart(() => {
      startX.value = offsetX.value;
      startY.value = offsetY.value;
      dragging.value = withTiming(1, { duration: 120 });
      runOnJS(buzz)();
    })
    .onUpdate((e) => {
      offsetX.value = Math.min(maxX, Math.max(minX, startX.value + e.translationX));
      offsetY.value = Math.min(maxY, Math.max(minY, startY.value + e.translationY));
    })
    .onEnd(() => {
      dragging.value = withTiming(0, { duration: 120 });
      runOnJS(persist)(offsetX.value, offsetY.value);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      // Lifts slightly while held so it's obvious the button is now movable.
      { scale: withSpring(1 + dragging.value * 0.12, { damping: 14 }) },
    ],
    opacity: loaded ? 1 : 0,
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        { left: anchor.left, right: anchor.right, bottom: anchor.bottom },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={drag}>
        <View>{children}</View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 20,
    shadowColor: colors.black,
  },
});
