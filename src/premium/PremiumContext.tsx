import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchPremiumStatus, initPurchases, waitForEntitlement } from '../lib/premium';
import type { PremiumStatus } from '../lib/premium';
import { FREE_MESSAGE_LIMIT } from '../lib/premium';
import { supabase } from '../lib/supabase';
import { useAccountPrompt } from '../auth/useAccountPrompt';

// Premium state for the whole app, so every screen agrees on what is unlocked
// and the paywall can be opened from anywhere.
//
// This is a convenience layer, not the enforcement layer. The real checks live
// in Postgres (RLS on the premium-only tables) and in the guardian Edge
// Function. If this context is wrong, nothing is given away.

type PremiumContextValue = PremiumStatus & {
  loading: boolean;
  /** Re-reads status from Supabase. */
  refresh: () => Promise<void>;
  /** Polls until the RevenueCat webhook has landed, then refreshes. */
  refreshAfterPurchase: () => Promise<void>;
  paywallVisible: boolean;
  /** Opens the paywall. `reason` decides the headline it shows. */
  showPaywall: (reason?: PaywallReason) => void;
  hidePaywall: () => void;
  paywallReason: PaywallReason;
};

export type PaywallReason = 'guardian' | 'contribute' | 'poi' | 'general';

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { requireAccount } = useAccountPrompt();
  const [status, setStatus] = useState<PremiumStatus>({
    premium: false,
    entitlement: null,
    freeRemaining: FREE_MESSAGE_LIMIT,
  });
  const [loading, setLoading] = useState(true);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallReason, setPaywallReason] = useState<PaywallReason>('general');

  const refresh = useCallback(async () => {
    setStatus(await fetchPremiumStatus());
    setLoading(false);
  }, []);

  // RevenueCat has to be logged in as the Supabase user, otherwise the webhook
  // receives an anonymous id it cannot match to an account. Re-run on every
  // auth change so signing into a different account doesn't inherit purchases.
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
      if (cancelled) return;
      await initPurchases(data.user?.id ?? null);
      await refresh();
    };

    void sync();

    const sub = supabase?.auth.onAuthStateChange(() => {
      void sync();
    });
    return () => {
      cancelled = true;
      sub?.data.subscription.unsubscribe();
    };
  }, [refresh]);

  const refreshAfterPurchase = useCallback(async () => {
    setStatus(await waitForEntitlement());
  }, []);

  // A guest is offered an account instead of the plans: an entitlement is
  // stored against a user id, so a purchase made with no account would be
  // unrecoverable — gone on reinstall, and impossible to restore.
  const showPaywall = useCallback(
    (reason: PaywallReason = 'general') => {
      if (requireAccount()) return;
      setPaywallReason(reason);
      setPaywallVisible(true);
    },
    [requireAccount],
  );

  const value = useMemo(
    () => ({
      ...status,
      loading,
      refresh,
      refreshAfterPurchase,
      paywallVisible,
      showPaywall,
      hidePaywall: () => setPaywallVisible(false),
      paywallReason,
    }),
    [status, loading, refresh, refreshAfterPurchase, paywallVisible, showPaywall, paywallReason],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  const value = useContext(PremiumContext);
  if (!value) throw new Error('usePremium must be used inside PremiumProvider');
  return value;
}
