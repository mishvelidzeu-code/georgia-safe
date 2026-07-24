import AsyncStorage from '@react-native-async-storage/async-storage';

const SELECTED_COUNTRY_KEY = 'georgia_safe_selected_country_id';
const TRUSTED_CONTACT_KEY = 'georgia_safe_trusted_contact';

export type TrustedContact = {
  name: string;
  phone: string;
};

export async function getSelectedCountryId(): Promise<string | null> {
  return AsyncStorage.getItem(SELECTED_COUNTRY_KEY);
}

export async function setSelectedCountryId(id: string): Promise<void> {
  await AsyncStorage.setItem(SELECTED_COUNTRY_KEY, id);
}

export async function getTrustedContact(): Promise<TrustedContact | null> {
  const raw = await AsyncStorage.getItem(TRUSTED_CONTACT_KEY);
  return raw ? (JSON.parse(raw) as TrustedContact) : null;
}

export async function setTrustedContact(contact: TrustedContact): Promise<void> {
  await AsyncStorage.setItem(TRUSTED_CONTACT_KEY, JSON.stringify(contact));
}
