import { Linking } from 'react-native';

// Contacting a partner (rental company, transfer, private driver) from a
// listing card. Shared so every card behaves the same way.

export function callPhone(phone: string) {
  Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
}

/**
 * Opens WhatsApp on the partner's number with the enquiry already typed, so
 * the tourist only has to press send. wa.me opens the app when installed and
 * WhatsApp Web otherwise; SMS with the same text is the fallback if neither
 * can open. Deliberately not an in-app chat: an enquiry belongs in a thread
 * the tourist keeps after the trip.
 */
export async function messageOnWhatsApp(phone: string, text: string) {
  const digits = phone.replace(/[^\d]/g, '');
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Linking.openURL(`sms:${phone.replace(/\s+/g, '')}&body=${encodeURIComponent(text)}`).catch(() => {});
  }
}
