import * as Updates from 'expo-updates';
import { Alert } from 'react-native';

// Over-the-air updates.
//
// app.json sets `checkAutomatically: "NEVER"` on purpose: expo-updates would
// otherwise swap the bundle in silently on the next cold start. This app is
// used in the street, sometimes in a bad moment, so the tourist is asked first
// and decides when the reload happens.

/** Guards against two prompts stacking if a check overlaps a foreground event. */
let prompting = false;

/**
 * Checks for a published update and, if one is waiting, offers to install it.
 *
 * `t` is passed in rather than imported: this runs from a component inside
 * LanguageProvider, so the prompt appears in the language the tourist picked.
 * Never throws — no update endpoint, no signal, or a failed download all end
 * quietly, because an update is never worth blocking the app over.
 */
export async function checkForAppUpdateAsync(t: (key: string) => string): Promise<void> {
  if (__DEV__ || prompting) return;

  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return;

    prompting = true;
    Alert.alert(t('update.title'), t('update.body'), [
      { text: t('update.later'), style: 'cancel', onPress: () => { prompting = false; } },
      {
        text: t('update.now'),
        onPress: async () => {
          try {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          } catch {
            // The download failed — say so instead of leaving a dead button.
            prompting = false;
            Alert.alert(t('update.failedTitle'), t('update.failedBody'));
          }
        },
      },
    ]);
  } catch {
    prompting = false;
  }
}
