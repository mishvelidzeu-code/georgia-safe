import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { colors } from '../theme/colors';

type Props = {
  lat: number;
  lng: number;
  count: number;
  /** The layer's pin colour, so the bubble still says what kind of pins it hides. */
  color: string;
  zIndex: number;
  onPress: () => void;
};

/**
 * "N pins here" bubble drawn in place of several pins of one layer. Tapping
 * it zooms the map to where the cluster splits apart (see mapClusters.ts).
 * The bubble grows slightly with the count so a 40 reads heavier than a 3.
 */
export default function ClusterMarker({ lat, lng, count, color, zIndex, onPress }: Props) {
  const size = count >= 100 ? 44 : count >= 10 ? 38 : 32;
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      zIndex={zIndex}
      onPress={onPress}
    >
      <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        <Text style={styles.count}>{count}</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  count: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
});
