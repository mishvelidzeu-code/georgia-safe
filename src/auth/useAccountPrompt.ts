import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * The one gate between guest mode and the account-only features.
 *
 * Call `requireAccount()` at the start of any action a guest cannot perform.
 * It returns true when the caller should stop (guest — a prompt has been
 * shown offering to create an account) and false when the action may proceed.
 *
 * Only three kinds of thing sit behind it, and each for a concrete reason,
 * not to push sign-ups: the assistant (metered per user on the server, so an
 * anonymous caller cannot be limited), contributing places and reviews (they
 * are attributed and moderated), and buying a plan (an entitlement has to
 * belong to an account or it is lost on reinstall). Everything else — map,
 * zones, landmarks, pharmacies, scams, emergency numbers, embassies, SOS,
 * fake call, check-in timer — stays open with no account.
 */
export function useAccountPrompt(): { requireAccount: () => boolean } {
  const { guest, leaveGuest } = useAuth();
  const { t } = useLanguage();

  const requireAccount = useCallback(() => {
    if (!guest) return false;
    Alert.alert(t('guest.requiredTitle'), t('guest.requiredBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('guest.createAccount'), onPress: () => void leaveGuest() },
    ]);
    return true;
  }, [guest, leaveGuest, t]);

  return { requireAccount };
}
