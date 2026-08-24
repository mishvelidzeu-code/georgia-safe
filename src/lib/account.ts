import { supabase } from './supabase';

// Account deletion.
//
// Required by App Store Review Guideline 5.1.1(v): if an app can create an
// account, it must be able to delete one from inside the app — not by email,
// not through a website.
//
// The deletion itself happens in the "delete-account" Edge Function, because
// removing an auth user needs the service role key, which must never be in the
// app bundle. The function works out whose account to delete from the caller's
// own token, so this call carries no user id.

export type DeleteAccountResult = { ok: true } | { ok: false };

/**
 * Deletes the signed-in account and everything linked to it.
 *
 * Never throws — offline or a server error resolve to `{ ok: false }` so the
 * screen can say "try again" instead of crashing on a destructive action.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  if (!supabase) return { ok: false };

  try {
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) {
      console.error('delete-account failed:', JSON.stringify(error, null, 2));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('delete-account threw:', err);
    return { ok: false };
  }
}
