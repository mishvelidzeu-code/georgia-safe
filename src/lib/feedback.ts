import { supabase } from './supabase';

export type ZoneVote = 'safe' | 'unsafe';

/**
 * Anonymous, fire-and-forget zone feedback ("I felt safe/unsafe here").
 * No device id, name, or user id is ever sent — just zone_id + vote (see
 * supabase/migrations/20260724120000_create_feedback_table.sql). The app
 * never reads this back or shows an aggregate score (no Local/Community
 * features — CLAUDE.md rule 3), so callers only need to know whether the
 * submit succeeded, to show a brief confirmation.
 *
 * Resolves to `false` instead of throwing when offline, Supabase is
 * unreachable, or misconfigured — voting is a nice-to-have, never something
 * that should surface an error to a tourist.
 */
export async function submitZoneFeedback(zoneId: string, vote: ZoneVote): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('feedback').insert({ zone_id: zoneId, vote });
  return !error;
}
