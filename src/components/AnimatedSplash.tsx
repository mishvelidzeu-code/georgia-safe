import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../theme/colors';

// The native splash (app.json) can only ever be a still image, so this is the
// standard Expo pattern for an animated one: the native splash hands over to
// a JS overlay that starts out looking identical, then animates. Because the
// two match pixel-for-pixel at frame 0 the handover is invisible.
const ZOOM_DURATION_MS = 1600;
// Held after the count-up finishes so the rating and its explanation are
// actually readable — without this the splash vanished before you could
// finish the sentence.
const HOLD_DURATION_MS = 2200;
const FADE_DURATION_MS = 450;
const START_SCALE = 1;
const END_SCALE = 1.35;
// Must match the `imageWidth` in app.json's expo-splash-screen config, or the
// image would visibly jump size at the handover.
const IMAGE_SIZE = 220;

// Deliberately English-only (user's explicit choice): the splash is shown
// before the tourist has picked a language, as a fixed brand statement.
const SAFETY_SCORE = 86;
const SAFETY_MAX = 100;
const SAFETY_TITLE = 'Georgia Safety Rating';
const SAFETY_LABEL = 'Very High';
const SAFETY_NOTE = 'Globally, a score of 80+ is considered a very high rating.';

type Props = {
  /** Called once the zoom + fade have finished and the app can take over. */
  onFinish: () => void;
};

export default function AnimatedSplash({ onFinish }: Props) {
  const scale = useRef(new Animated.Value(START_SCALE)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  // Counts up alongside the zoom. Driven by its own Animated.Value + listener
  // rather than a timer so it shares the zoom's easing and finishes with it.
  const scoreProgress = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    // Text content can't be animated natively, so this one drives React state.
    // setState only fires when the *rounded* value changes, capping it at
    // SAFETY_SCORE updates over the whole animation instead of one per frame.
    let lastRounded = 0;
    const listenerId = scoreProgress.addListener(({ value }) => {
      const rounded = Math.round(value);
      if (rounded !== lastRounded) {
        lastRounded = rounded;
        setDisplayScore(rounded);
      }
    });

    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, {
          toValue: END_SCALE,
          duration: ZOOM_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scoreProgress, {
          toValue: SAFETY_SCORE,
          duration: ZOOM_DURATION_MS,
          easing: Easing.out(Easing.quad),
          // Must stay on the JS driver — the listener needs the value.
          useNativeDriver: false,
        }),
      ]),
      Animated.delay(HOLD_DURATION_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      // Only advance on a real completion — if the animation is interrupted
      // (component unmounted mid-flight) the callback would fire on a torn
      // down tree.
      if (finished) onFinish();
    });

    return () => scoreProgress.removeListener(listenerId);
    // Runs exactly once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image
          source={require('../../assets/1.png')}
          style={styles.image}
          contentFit="contain"
        />
      </Animated.View>

      <View style={styles.ratingBlock}>
        <Text style={styles.ratingTitle}>{SAFETY_TITLE}</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.score}>{displayScore}</Text>
          <Text style={styles.scoreMax}>/{SAFETY_MAX}</Text>
        </View>
        <Text style={styles.ratingLabel}>{SAFETY_LABEL}</Text>
        <Text style={styles.ratingNote}>{SAFETY_NOTE}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Must match app.json's expo-splash-screen backgroundColor.
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  ratingBlock: {
    alignItems: 'center',
    // A scale transform doesn't affect layout, so this has to manually clear
    // the image's grown footprint. It scales from its centre, so only half
    // the added height (IMAGE_SIZE * 0.35) extends downward.
    marginTop: (IMAGE_SIZE * (END_SCALE - 1)) / 2 + 24,
  },
  ratingTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
  },
  score: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '800',
  },
  scoreMax: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 2,
  },
  ratingLabel: {
    // Bright green rather than the map's dark-green "very safe" tone, which
    // would be hard to read on this dark splash background.
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  ratingNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 12,
    // Keeps the sentence to ~2 lines instead of stretching edge to edge.
    maxWidth: 260,
  },
});
