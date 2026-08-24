import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

const NORMAL_SCALE = 1;
const VISITED_SCALE = 0.65;
const FLASH_SCALE = 1.5;
// How much larger the pin gets while selected, layered on top of its normal/
// visited base size (Google Maps-style "this is the one I tapped" cue) — it
// stays enlarged even after the info sheet is closed, until the tourist taps
// something else, so they can still tell which pin they were just looking at.
const SELECTED_MULTIPLIER = 1.6;

type Props = {
  lat: number;
  lng: number;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  visited: boolean;
  // True for exactly one render — the moment this landmark's geofence just
  // fired. Plays a one-time "green flash → shrink → gray" transition; a
  // landmark that was already visited on mount renders straight in its
  // final small/gray resting state, no replay.
  justVisited: boolean;
  // True while this is the landmark the tourist last tapped (derived from
  // MapScreen's `selection` state, which outlives the sheet being closed).
  selected: boolean;
  // Draw order relative to MapScreen's other marker layers (Z_INDEX there).
  zIndex: number;
  onAnimationDone?: () => void;
  onPress: () => void;
};

/**
 * A single landmark pin on the Map. Handles its own visited-state and
 * selected-state animations so MapScreen doesn't need one Animated.Value
 * per landmark — only the marker currently transitioning ever animates.
 */
export default function LandmarkMarker({
  lat,
  lng,
  title,
  icon,
  color,
  visited,
  justVisited,
  selected,
  zIndex,
  onAnimationDone,
  onPress,
}: Props) {
  const baseScale = useRef(new Animated.Value(visited ? VISITED_SCALE : NORMAL_SCALE)).current;
  const colorProgress = useRef(new Animated.Value(visited ? 1 : 0)).current; // 0=category color, 1=visited gray
  const selectionScale = useRef(new Animated.Value(selected ? SELECTED_MULTIPLIER : 1)).current;
  const selectionBorder = useRef(new Animated.Value(selected ? 1 : 0)).current; // 0=normal border, 1=highlighted
  // tracksViewChanges must be true while animating (react-native-maps only
  // re-snapshots the marker bitmap on request) and false at rest, matching
  // the perf pattern used by every other marker layer on this map. Two
  // independent animations (visited-flash, selection) can overlap, so each
  // tracks its own "is it animating right now" flag.
  const [flashing, setFlashing] = useState(justVisited);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    if (!justVisited) return;
    setFlashing(true);
    Animated.sequence([
      Animated.timing(baseScale, { toValue: FLASH_SCALE, duration: 250, useNativeDriver: false }),
      Animated.parallel([
        Animated.timing(baseScale, { toValue: VISITED_SCALE, duration: 550, useNativeDriver: false }),
        Animated.timing(colorProgress, { toValue: 1, duration: 550, useNativeDriver: false }),
      ]),
    ]).start(() => {
      setFlashing(false);
      onAnimationDone?.();
    });
    // Only ever runs for the single render where justVisited flips true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justVisited]);

  useEffect(() => {
    setSelecting(true);
    Animated.parallel([
      Animated.spring(selectionScale, {
        toValue: selected ? SELECTED_MULTIPLIER : 1,
        useNativeDriver: false,
        friction: 6,
      }),
      Animated.timing(selectionBorder, {
        toValue: selected ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start(() => setSelecting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const bubbleColor = justVisited
    ? colorProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.safe, colors.textMuted],
      })
    : visited
      ? colors.textMuted
      : color;

  const borderWidth = selectionBorder.interpolate({ inputRange: [0, 1], outputRange: [2, 3] });
  const borderColor = selectionBorder.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.white, colors.text],
  });

  return (
    // No `title` passed to the native Marker on purpose — react-native-maps
    // shows a default callout bubble above the pin whenever title/description
    // are set, which our own bottom sheet already makes redundant (and this
    // library version has no calloutEnabled prop to suppress it directly).
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      accessibilityLabel={title}
      anchor={{ x: 0.5, y: 1 }}
      // Fixed draw order relative to the other marker layers in MapScreen —
      // without it, pins sharing a coordinate flicker as Google Maps reshuffles
      // them on each redraw.
      zIndex={zIndex}
      tracksViewChanges={flashing || selecting}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.pinContainer,
          { transform: [{ scale: Animated.multiply(baseScale, selectionScale) }] },
        ]}
      >
        <Animated.View
          style={[styles.pinBubble, { backgroundColor: bubbleColor, borderWidth, borderColor }]}
        >
          <Ionicons name={icon} size={13} color={colors.background} />
        </Animated.View>
        <Animated.View style={[styles.pinArrow, { borderTopColor: bubbleColor }]} />
      </Animated.View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pinContainer: {
    alignItems: 'center',
  },
  pinBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
