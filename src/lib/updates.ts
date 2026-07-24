import * as Updates from 'expo-updates';
import { Alert } from 'react-native';

export async function checkForAppUpdateAsync(): Promise<void> {
  if (__DEV__) return;

  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return;

    Alert.alert(
      'ახალი განახლება ხელმისაწვდომია',
      'Georgia Safe-ის ახალი ვერსია მზადაა — გინდა ახლავე გადატვირთვა უახლესი უსაფრთხოების მონაცემებისთვის?',
      [
        { text: 'მოგვიანებით', style: 'cancel' },
        {
          text: 'განახლება',
          onPress: async () => {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          },
        },
      ],
    );
  } catch (error) {
    console.log('Update check failed:', error);
  }
}
