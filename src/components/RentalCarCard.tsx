import { useState } from 'react';
import {
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import type { RentalCar } from '../lib/rentals';
import { tapFeedback } from '../lib/haptics';
import PhotoViewerModal from './PhotoViewerModal';

// Photos fill the card's width so swiping snaps one photo at a time. The card
// sits inside the screen's 16pt horizontal padding.
const PHOTO_WIDTH = Dimensions.get('window').width - 32 - 24;

function call(phone: string) {
  Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
}

/**
 * Opens WhatsApp on the partner's number with the enquiry already typed, so
 * the tourist only has to press send. wa.me opens the app when installed and
 * WhatsApp Web otherwise; SMS with the same text is the fallback if neither
 * can open. Deliberately not an in-app chat: a rental enquiry belongs in a
 * thread the tourist keeps after the trip.
 */
async function messageOnWhatsApp(phone: string, text: string) {
  const digits = phone.replace(/[^\d]/g, '');
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Linking.openURL(`sms:${phone.replace(/\s+/g, '')}&body=${encodeURIComponent(text)}`).catch(() => {});
  }
}

/**
 * One car, one card. Collapsed it shows the first photo and the headline
 * facts; tapping expands it to the full spec, the description and the contact
 * buttons, with the remaining photos swipeable side to side.
 */
export default function RentalCarCard({ car }: { car: RentalCar }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  // Index of the photo the full-screen viewer opened on; null = closed.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const openViewer = (index: number) => {
    if (car.photoUrls.length === 0) return;
    tapFeedback();
    setViewerIndex(index);
  };

  const spec = [
    car.bodyType ? t(`rentals.${car.bodyType}`) : null,
    car.year ? String(car.year) : null,
    car.transmission ? t(`rentals.${car.transmission}`) : null,
    car.seats ? `${car.seats} ${t('rentals.seats')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.header}
        onPress={() => {
          tapFeedback();
          setOpen((v) => !v);
        }}
      >
        {car.photoUrls[0] ? (
          <Pressable onPress={() => openViewer(0)} accessibilityRole="imagebutton">
            <Image source={{ uri: car.photoUrls[0] }} style={styles.thumb} contentFit="cover" />
            {car.photoUrls.length > 1 && (
              <View style={styles.thumbCount}>
                <Ionicons name="images" size={9} color={colors.white} />
                <Text style={styles.thumbCountText}>{car.photoUrls.length}</Text>
              </View>
            )}
          </Pressable>
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="car-sport" size={22} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {car.make} {car.model}
          </Text>
          {spec ? <Text style={styles.spec}>{spec}</Text> : null}
          <Text style={styles.company} numberOfLines={1}>
            {car.companyName} · {car.city}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {car.pricePerDay !== null && (
            <Text style={styles.price}>
              {car.pricePerDay}₾
              <Text style={styles.perDay}>/{t('rentals.perDay')}</Text>
            </Text>
          )}
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </View>
      </Pressable>

      {open && (
        <View style={styles.body}>
          {car.photoUrls.length > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.gallery}
            >
              {car.photoUrls.map((url, i) => (
                <Pressable key={url} onPress={() => openViewer(i)} accessibilityRole="imagebutton">
                  <Image source={{ uri: url }} style={styles.photo} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          )}

          {car.photoUrls.length > 1 && (
            <Text style={styles.photoHint}>
              {car.photoUrls.length} {t('rentals.photos')}
            </Text>
          )}

          {car.description ? <Text style={styles.description}>{car.description}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, styles.callButton]}
              onPress={() => {
                tapFeedback();
                call(car.phone);
              }}
            >
              <Ionicons name="call" size={16} color={colors.white} />
              <Text style={styles.actionText}>{t('common.call')}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.messageButton]}
              onPress={() => {
                tapFeedback();
                void messageOnWhatsApp(
                  car.whatsapp,
                  t('rentals.whatsappMessage').replace('{title}', `${car.make} ${car.model}`.trim()),
                );
              }}
            >
              <Ionicons name="logo-whatsapp" size={16} color={colors.white} />
              <Text style={styles.actionText}>WhatsApp</Text>
            </Pressable>
          </View>
        </View>
      )}

      <PhotoViewerModal
        urls={car.photoUrls}
        initialIndex={viewerIndex ?? 0}
        visible={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  thumb: {
    width: 72,
    height: 54,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  thumbCount: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  thumbCountText: { color: colors.white, fontSize: 9, fontWeight: '700' },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  spec: {
    color: colors.textMuted,
    fontSize: 12,
  },
  company: {
    color: colors.textMuted,
    fontSize: 11,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  price: {
    color: colors.safe,
    fontSize: 15,
    fontWeight: '700',
  },
  perDay: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '400',
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
  },
  gallery: {
    borderRadius: 10,
  },
  photo: {
    width: PHOTO_WIDTH,
    height: 180,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: colors.background,
  },
  photoHint: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  description: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  callButton: {
    backgroundColor: colors.safe,
  },
  messageButton: {
    backgroundColor: '#25D366',
  },
  actionText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
});
