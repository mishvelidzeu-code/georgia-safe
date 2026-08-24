import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { signOut as signOutRequest } from '../lib/auth';
import {
  isGuestMode,
  isOnboardingDone,
  setGuestMode,
  setOnboardingDone,
} from '../lib/storage';

type AuthContextValue = {
  session: Session | null;
  /** True until the stored session has been restored — the splash stays up. */
  initializing: boolean;
  onboardingDone: boolean;
  /**
   * Using the app without an account. Everything that identifies a person or
   * costs money is closed; the whole safety layer is open. Apple requires
   * this (Guideline 5.1.1(v): no forced sign-up for features that don't need
   * an account) and it is the right default anyway — someone who downloads a
   * safety app in a bad moment must not have to register before she can look
   * at the map or press SOS.
   */
  guest: boolean;
  continueAsGuest: () => Promise<void>;
  /** Ends guest mode, sending them back to sign-up/login. */
  leaveGuest: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * How long the splash may wait for Supabase to hand back the stored session.
 *
 * getSession() is not a local read: an access token older than ~1 hour is
 * expired, and auth-js then refreshes it over the network *before* it
 * resolves — retrying with backoff for up to 30s, on top of whatever the
 * socket itself takes to give up. Awaiting that kept the native splash (the
 * mascot) frozen for close to a minute on a slow or dead connection.
 *
 * Nothing on the first screen needs the session: AppEntry decides between
 * onboarding and the tabs from the local AsyncStorage flags alone. So the
 * wait is capped, and a session that arrives later still lands through the
 * onAuthStateChange listener below (INITIAL_SESSION / TOKEN_REFRESHED).
 */
const SESSION_RESTORE_TIMEOUT_MS = 2000;

async function restoreSessionAsync(): Promise<Session | null> {
  if (!supabase) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SESSION_RESTORE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      supabase.auth.getSession().then(({ data }) => data.session),
      timeout,
    ]);
  } catch {
    // Unreachable — fall back to "signed out"; the local onboarding flag
    // still decides whether they see onboarding again.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [onboardingDone, setOnboardingDoneState] = useState(false);
  const [guest, setGuestState] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      // Onboarding state is local-first so a returning tourist with no network
      // isn't sent back through sign-up.
      const [done, guestMode] = await Promise.all([isOnboardingDone(), isGuestMode()]);

      const restored = await restoreSessionAsync();

      if (cancelled) return;
      setSession(restored);
      setOnboardingDoneState(done);
      setGuestState(guestMode);
      setInitializing(false);
    }

    restore();

    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    // Signing up (or logging in) ends guest mode: they now have an account,
    // so nothing should stay locked.
    await Promise.all([setOnboardingDone(true), setGuestMode(false)]);
    setOnboardingDoneState(true);
    setGuestState(false);
  }, []);

  const continueAsGuest = useCallback(async () => {
    await setGuestMode(true);
    setGuestState(true);
  }, []);

  const leaveGuest = useCallback(async () => {
    await setGuestMode(false);
    setGuestState(false);
  }, []);

  const signOut = useCallback(async () => {
    await signOutRequest();
    // Clearing the local flags too, otherwise the tourist would be signed out
    // but still dropped into the tabs with no way back to the login screen.
    await Promise.all([setOnboardingDone(false), setGuestMode(false)]);
    setOnboardingDoneState(false);
    setGuestState(false);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      initializing,
      onboardingDone,
      guest,
      continueAsGuest,
      leaveGuest,
      completeOnboarding,
      signOut,
    }),
    [
      session,
      initializing,
      onboardingDone,
      guest,
      continueAsGuest,
      leaveGuest,
      completeOnboarding,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
