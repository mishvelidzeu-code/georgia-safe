import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Missing/invalid config must never crash the app — the app is offline-first
// (see src/lib/remoteData.ts + useRemoteData.ts): every screen ships with the
// bundled local JSON and only *upgrades* to Supabase data in the background
// when it's reachable. So `supabase` is nullable instead of throwing.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

if (!supabase) {
  console.warn(
    'Supabase არ არის კონფიგურირებული (.env-ში აკლია EXPO_PUBLIC_SUPABASE_URL/ANON_KEY) — აპი გამოიყენებს ლოკალურ JSON მონაცემებს.',
  );
}
