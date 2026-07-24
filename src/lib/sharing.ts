import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

/**
 * იღებს ვიზუალურ "ანაბეჭდს" (screenshot) მითითებული View-სგან
 * (მაგ. Safety Card) და ხსნის ნატივ share sheet-ს.
 */
export async function captureAndShareViewAsync(
  viewRef: React.RefObject<any>,
): Promise<void> {
  const uri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
  });

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) return;

  await Sharing.shareAsync(uri, { mimeType: 'image/png' });
}

/**
 * ინახავს მოცემულ სურათს (uri) მომხმარებლის გალერეაში,
 * წინასწარ ითხოვს საჭირო უფლებას.
 */
export async function saveImageToGalleryAsync(uri: string): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') return false;

  await MediaLibrary.saveToLibraryAsync(uri);
  return true;
}
