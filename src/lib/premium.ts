import Purchases from 'react-native-purchases';
import type { PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Premium access.
//
// Two sources of truth, on purpose:
//   RevenueCat — owns the purchase flow and the store receipts.
//   Supabase   — owns "is this person premium right now", written only by the
//                RevenueCat webhook (see supabase/functions/revenuecat-webhook).
//
// The app reads Supabase, not RevenueCat, because the Guardian Edge Function
// has to make the same decision server-side before it spends money on Gemini.
// One answer, one place — the app and the server can never disagree.

/** Matches FREE_MESSAGE_LIMIT in supabase/functions/guardian/index.ts. */
export const FREE_MESSAGE_LIMIT = 5;

export type Plan = 'pass_5d' | 'pass_10d' | 'monthly';

export type Entitlement = {
  plan: Plan;
  expiresAt: Date;
};

export type PremiumStatus = {
  premium: boolean;
  entitlement: Entitlement | null;
  /** Free Guardian messages left. Only meaningful when premium is false. */
  freeRemaining: number;
};

/** Product ids as created in App Store Connect / Google Play. */
export const PRODUCT_IDS: Record<Plan, string> = {
  pass_5d: 'georgia_safe_pass_5d',
  pass_10d: 'georgia_safe_pass_10d',
  monthly: 'georgia_safe_monthly',
};

/** Shortest first, the auto-renewing plan last — the order the paywall reads. */
export const PLAN_ORDER: readonly Plan[] = ['pass_5d', 'pass_10d', 'monthly'];

/** Translation keys for the plan names, shared by the paywall and the profile. */
export const PLAN_NAME_KEYS: Record<Plan, string> = {
  pass_5d: 'premium.plan5d',
  pass_10d: 'premium.plan10d',
  monthly: 'premium.planMonthly',
};

/** Reverse of PRODUCT_IDS: what the store sold us, in our own terms. */
export function planForProduct(productId: string): Plan | null {
  const match = PLAN_ORDER.find((plan) => PRODUCT_IDS[plan] === productId);
  return match ?? null;
}

/**
 * Only the monthly plan renews. The two passes are non-renewing purchases, and
 * the paywall has to say so plainly — Apple treats an unclear renewal as a
 * rejection, and a tourist buying a 5-day pass must not fear a silent charge.
 */
export function isAutoRenewing(plan: Plan): boolean {
  return plan === 'monthly';
}

const API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let configured = false;

/**
 * Starts RevenueCat and links the purchase to the Supabase user.
 *
 * Logging in with the Supabase user id is what makes the webhook work: it
 * arrives as `app_user_id`, which is the primary key of the entitlements
 * table. Without it a purchase cannot be matched to an account, and the
 * webhook deliberately ignores anonymous ids rather than guessing.
 *
 * Safe to call repeatedly — later calls only refresh the logged-in user.
 */
export async function initPurchases(userId: string | null): Promise<void> {
  const apiKey = Platform.OS === 'ios' ? API_KEY_IOS : API_KEY_ANDROID;
  if (!apiKey) return; // Not configured yet — the app runs, purchases just aren't offered.

  try {
    if (!configured) {
      // configure() is synchronous in this SDK — it returns void, not a promise.
      Purchases.configure({ apiKey, appUserID: userId ?? undefined });
      configured = true;
    } else if (userId) {
      await Purchases.logIn(userId);
    }
  } catch {
    // Store unreachable or misconfigured — never block app start over billing.
  }
}

/** Called on sign-out so the next account doesn't inherit this one's purchases. */
export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Nothing actionable.
  }
}

/**
 * The three packages, in the order the paywall shows them. Returns an empty
 * list when RevenueCat isn't configured or the store is unreachable — the
 * paywall then shows an explanation instead of empty buttons.
 */
export async function fetchPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch {
    return [];
  }
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'failed';

/**
 * Runs the store purchase sheet. A success here does NOT immediately mean the
 * app is premium: RevenueCat still has to call our webhook, which writes the
 * entitlement. The caller should re-read status afterwards (see
 * waitForEntitlement) rather than assuming.
 */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    await Purchases.purchasePackage(pkg);
    return 'purchased';
  } catch (e) {
    const err = e as { userCancelled?: boolean };
    return err?.userCancelled ? 'cancelled' : 'failed';
  }
}

/** Apple requires a visible restore option for previously bought products. */
export async function restore(): Promise<boolean> {
  if (!configured) return false;
  try {
    await Purchases.restorePurchases();
    return true;
  } catch {
    return false;
  }
}

/**
 * Current status, read from Supabase.
 *
 * Never throws: on any failure it reports "not premium, full free allowance",
 * which keeps the app usable offline. The server makes the real decision
 * anyway, so an over-generous client reading cannot give anything away.
 */
export async function fetchPremiumStatus(): Promise<PremiumStatus> {
  const fallback: PremiumStatus = {
    premium: false,
    entitlement: null,
    freeRemaining: FREE_MESSAGE_LIMIT,
  };
  if (!supabase) return fallback;

  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return fallback;

    const [entRes, usageRes] = await Promise.all([
      supabase.from('entitlements').select('plan, expires_at').eq('user_id', userId).maybeSingle(),
      supabase
        .from('guardian_usage')
        .select('free_messages_used')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    const used = Number(usageRes.data?.free_messages_used ?? 0);
    const freeRemaining = Math.max(0, FREE_MESSAGE_LIMIT - used);

    const row = entRes.data;
    if (!row) return { premium: false, entitlement: null, freeRemaining };

    const expiresAt = new Date(String(row.expires_at));
    const premium = expiresAt.getTime() > Date.now();
    return {
      premium,
      entitlement: premium ? { plan: row.plan as Plan, expiresAt } : null,
      freeRemaining,
    };
  } catch {
    return fallback;
  }
}

/**
 * Polls until the webhook has landed, for up to ~10s.
 *
 * The gap between "the store took the money" and "our database says premium"
 * is a webhook round trip. Without this the tourist would pay and still see a
 * paywall, which is the worst possible moment to look broken.
 */
export async function waitForEntitlement(): Promise<PremiumStatus> {
  let status = await fetchPremiumStatus();
  for (let attempt = 0; attempt < 5 && !status.premium; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    status = await fetchPremiumStatus();
  }
  return status;
}
