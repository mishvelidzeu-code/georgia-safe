import { Linking, Platform } from 'react-native';

// Legal links.
//
// App Store Review Guideline 3.1.2 requires that any screen selling a
// subscription shows working links to the terms of use and the privacy policy,
// and that the app tells people how to manage what they bought. A dead link
// here is one of the most common reasons a paywall is rejected, so all three
// live in one place instead of being typed into components.

/**
 * Apple's standard EULA. Apple accepts this in place of custom terms, and it
 * is hosted by Apple — so it can never 404 the way our own page could.
 */
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/**
 * Published on the project's Google Site. Percent-encoded because the page
 * name is Georgian — the escaped form is what Linking.openURL needs.
 *
 * The exact same URL has to go into App Store Connect → App Privacy → Privacy
 * Policy URL. If the page is ever moved, change it here and there together.
 */
export const PRIVACY_POLICY_URL =
  'https://sites.google.com/view/georgia-safe/%E1%83%9B%E1%83%97%E1%83%90%E1%83%95%E1%83%90%E1%83%A0%E1%83%98';

/** Where the store lets someone see, change or cancel a subscription. */
export const MANAGE_SUBSCRIPTIONS_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

/**
 * Opens a link without ever throwing — offline, these simply do nothing,
 * the same convention as every other outbound link in the app.
 */
export function openLegalUrl(url: string): void {
  Linking.openURL(url).catch(() => {});
}
