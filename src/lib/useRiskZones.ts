import { useEffect, useState } from 'react';
import { fetchRiskZones, getCachedRiskZones, isRiskZoneActive } from './riskZones';
import type { RiskZone } from './riskZones';

// Expired circles must leave the map while it is open, not only on the next
// fetch — a 3-hour zone created at 14:00 should be gone at 17:00 exactly.
const PRUNE_INTERVAL_MS = 60 * 1000;

/**
 * Active risk zones: the offline cache first (instant, works without a
 * connection), then the server once per mount — bump `reloadToken` to fetch
 * again after an admin edit. There is no bundled fallback on purpose: zones
 * are admin-marked and time-limited, so a copy shipped in the app would be
 * wrong by definition.
 */
export function useRiskZones(reloadToken = 0): RiskZone[] {
  const [zones, setZones] = useState<RiskZone[]>([]);

  useEffect(() => {
    let cancelled = false;
    getCachedRiskZones().then((cached) => {
      if (!cancelled && cached.length > 0) setZones((current) => (current.length === 0 ? cached : current));
    });
    fetchRiskZones()
      .then((remote) => {
        if (!cancelled) setZones(remote);
      })
      .catch(() => {
        // Offline, unreachable, or misconfigured — keep showing the cache.
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    const interval = setInterval(() => {
      setZones((current) => {
        const active = current.filter((zone) => isRiskZoneActive(zone));
        return active.length === current.length ? current : active;
      });
    }, PRUNE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return zones;
}
