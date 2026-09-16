import Supercluster from 'supercluster';
import type { Region } from 'react-native-maps';

// Per-layer pin clustering for the map. Each layer (police stations, ATMs,
// community alerts, one partner category...) gets its own index, so a cluster
// bubble keeps the layer's colour and the count only ever means "N pins of
// this kind" — the same way Google's own map thins labels by zoom, except we
// do it per layer instead of mixing everything into one grey blob.

export type ClusterItem<T> =
  | { kind: 'point'; item: T }
  | { kind: 'cluster'; id: number; lat: number; lng: number; count: number; expansionZoom: number };

type PointProps<T> = { item: T };

export type ClusterIndex<T> = Supercluster<PointProps<T>, Supercluster.AnyProps>;

// Pixel radius within which pins merge, on supercluster's 256px tile scale.
// 50 ≈ two pins whose bubbles would overlap or nearly touch on a phone.
const CLUSTER_RADIUS_PX = 50;
// Past this zoom nothing is merged any more — street level, every pin shows.
const CLUSTER_MAX_ZOOM = 16;

/**
 * Web-Mercator zoom for a react-native-maps region. Only self-consistency
 * matters: the same formula converts back in zoomToDelta, so tapping a
 * cluster lands exactly where supercluster says it splits apart.
 */
export function regionToZoom(region: Region): number {
  return Math.log2(360 / region.longitudeDelta);
}

export function zoomToDelta(zoom: number): number {
  return 360 / 2 ** zoom;
}

export function buildClusterIndex<T>(
  items: T[],
  coordinate: (item: T) => { lat: number; lng: number },
): ClusterIndex<T> {
  const index: ClusterIndex<T> = new Supercluster({
    radius: CLUSTER_RADIUS_PX,
    maxZoom: CLUSTER_MAX_ZOOM,
  });
  index.load(
    items.map((item) => {
      const { lat, lng } = coordinate(item);
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        properties: { item },
      };
    }),
  );
  return index;
}

/**
 * Clusters and loose points inside the region (plus `margin`, a fraction of
 * the visible size on each side, so pins are already mounted when they slide
 * into view). Expansion zoom is resolved here so the tap handler needs no
 * access to the index.
 */
export function clustersInRegion<T>(
  index: ClusterIndex<T>,
  region: Region,
  margin: number,
): ClusterItem<T>[] {
  const latPad = region.latitudeDelta * (0.5 + margin);
  const lngPad = region.longitudeDelta * (0.5 + margin);
  const bbox: [number, number, number, number] = [
    region.longitude - lngPad,
    region.latitude - latPad,
    region.longitude + lngPad,
    region.latitude + latPad,
  ];
  const zoom = Math.max(0, Math.floor(regionToZoom(region)));
  return index.getClusters(bbox, zoom).map((feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    if ('cluster' in feature.properties && feature.properties.cluster) {
      const id = feature.properties.cluster_id;
      return {
        kind: 'cluster',
        id,
        lat,
        lng,
        count: feature.properties.point_count,
        expansionZoom: index.getClusterExpansionZoom(id),
      };
    }
    return { kind: 'point', item: (feature.properties as PointProps<T>).item };
  });
}
