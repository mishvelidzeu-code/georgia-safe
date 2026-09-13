import { useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';

type Props = {
  urls: string[];
  /** Which photo to open on; clamped to the list. */
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Full-screen photo viewer: swipe sideways between a listing's photos, tap the
 * picture or the × to close. Page counter top-centre, dots at the bottom.
 */
export default function PhotoViewerModal({ urls, initialIndex, visible, onClose }: Props) {
  const { t } = useLanguage();
  const listRef = useRef<FlatList<string>>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const start = Math.min(Math.max(initialIndex, 0), Math.max(urls.length - 1, 0));
    setIndex(start);
  }, [visible, initialIndex, urls.length]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FlatList
          ref={listRef}
          data={urls}
          keyExtractor={(url, i) => `${i}-${url}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(Math.max(initialIndex, 0), Math.max(urls.length - 1, 0))}
          getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => (
            <Pressable style={styles.page} onPress={onClose}>
              <Image source={{ uri: item }} style={styles.image} contentFit="contain" transition={150} />
            </Pressable>
          )}
        />
        {urls.length > 1 && (
          <>
            <Text style={styles.counter}>{index + 1} / {urls.length}</Text>
            <View style={styles.dots}>
              {urls.map((url, i) => (
                <View key={`${i}-${url}`} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
          </>
        )}
        <Pressable style={styles.close} onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Ionicons name="close" size={26} color={colors.white} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  page: { width: SCREEN_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  counter: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  dots: { position: 'absolute', bottom: 48, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { backgroundColor: colors.white, width: 18 },
  close: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
