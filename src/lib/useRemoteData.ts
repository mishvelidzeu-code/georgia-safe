import { useEffect, useRef, useState } from 'react';

/**
 * Stale-while-revalidate for reference data (zones, scams, safe places,
 * emergency contacts): renders `localData` (the bundled JSON) instantly on
 * mount — so the screen is never blank or spinning — then tries `fetcher`
 * (a Supabase query) once in the background and swaps the state in only if
 * it succeeds. If there's no network, Supabase is unreachable, or `.env` is
 * misconfigured, the fetch just rejects and the local data stays as-is.
 *
 * This is what makes "pages work offline" (see CLAUDE.md Phase 3.12) hold
 * true even after Phase 4 wires up Supabase as the source of truth.
 */
export function useRemoteData<T>(localData: T, fetcher: () => Promise<T>): T {
  const [data, setData] = useState<T>(localData);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;

    fetcherRef
      .current()
      .then((remote) => {
        if (!cancelled) setData(remote);
      })
      .catch(() => {
        // Offline, unreachable, or misconfigured — keep showing local data.
      });

    return () => {
      cancelled = true;
    };
    // Intentionally fetch once per mount, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return data;
}
