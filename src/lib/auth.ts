import { supabase } from './supabase';

// Thin wrapper over Supabase Auth. Passwords are never stored or handled by
// this app beyond passing them straight to Supabase (which hashes them
// server-side) — nothing is written to AsyncStorage except the session token
// Supabase itself manages.

export type AuthFailureReason =
  | 'offline'
  | 'invalid-credentials'
  | 'email-taken'
  | 'weak-password'
  | 'unknown';

export type AuthResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; reason: AuthFailureReason; message?: string };

/** Matches Supabase's own default minimum. */
export const MIN_PASSWORD_LENGTH = 6;

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function classify(message: string): AuthFailureReason {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) return 'email-taken';
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'invalid-credentials';
  if (m.includes('password')) return 'weak-password';
  return 'unknown';
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, reason: 'offline' };
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, reason: classify(error.message), message: error.message };
    // When the project has email confirmation enabled, Supabase returns a user
    // but no session — the caller must tell the tourist to check their inbox
    // instead of dropping them into the app.
    return { ok: true, needsEmailConfirmation: !data.session };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, reason: 'offline' };
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, reason: classify(error.message), message: error.message };
    return { ok: true, needsEmailConfirmation: false };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // Already signed out / unreachable — the local session is cleared either
    // way by the auth state listener.
  }
}
