import { useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import type { PartnerListing } from '../lib/rentals';
import { cityName } from '../lib/cities';
import { tapFeedback } from '../lib/haptics';
import { callPhone, messageOnWhatsApp } from '../lib/contact';
import PhotoViewerModal from './PhotoViewerModal';

// Photos fill the card's width so swiping snaps one photo at a time. The card
// sits inside the modal's 16pt horizontal padding and has 12pt of its own.
const PHOTO_WIDTH = Dimensions.get('window').width - 32 - 24;

/**
 * One transfer car, private taxi or rental bike. Always open, unlike a rental
 * car card: the tourist is here to look at the vehicle and message the owner,
 * so the photos and the WhatsApp button come first.
 */
export default function RideListingCard({ listing }: { listing: PartnerListing }) {
  const { t, language } = useLanguage();
  // Index of the photo the full-screen viewer opened on; null = closed.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const whatsapp = listing.whatsapp ?? listing.phone;

  return (
    <View style={styles.card}>
      {listing.photoUrls.length > 0 ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {listing.photoUrls.map((url, i) => (
            <Pressable
              key={url}
              onPress={() => {
                tapFeedback();
                setViewerIndex(i);
              }}
              accessibilityRole="imagebutton"
            >
              <Image source={{ uri: url }} style={styles.photo} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}>
          <Ionicons name={listing.category === 'bike_rental' ? 'bicycle' : 'car-sport'} size={40} color={colors.textMuted} />
        </View>
      )}
      {listing.photoUrls.length > 1 && (
        <Text style={styles.photoHint}>
          {listing.photoUrls.length} {t('rentals.photos')}
        </Text>
      )}

      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={2}>
          {listing.title}
        </Text>
        {listing.priceDescription ? <Text style={styles.price}>{listing.priceDescription}</Text> : null}
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {[listing.companyName, cityName(listing.city, language)].filter(Boolean).join(' · ')}
      </Text>
      {listing.workingHours ? (
        <View style={styles.hoursRow}>
          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
          <Text style={styles.meta}>{listing.workingHours}</Text>
        </View>
      ) : null}
      {listing.description ? <Text style={styles.description}>{listing.description}</Text> : null}

      <View style={styles.actions}>
        {listing.phone ? (
          <Pressable
            style={[styles.actionButton, styles.callButton]}
            onPress={() => {
              tapFeedback();
              callPhone(listing.phone ?? '');
            }}
          >
            <Ionicons name="call" size={16} color={colors.white} />
            <Text style={styles.actionText}>{t('common.call')}</Text>
          </Pressable>
        ) : null}
        {whatsapp ? (
          <Pressable
            style={[styles.actionButton, styles.whatsappButton]}
            onPress={() => {
              tapFeedback();
              void messageOnWhatsApp(whatsapp, t('rentals.whatsappMessage').replace('{title}', listing.title));
            }}
          >
            <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
            <Text style={styles.actionText}>WhatsApp</Text>
          </Pressable>
        ) : null}
      </View>

      <PhotoViewerModal
        urls={listing.photoUrls}
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
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  photo: {
    width: PHOTO_WIDTH,
    height: 190,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: colors.background,
  },
  photoEmpty: {
    marginRight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  price: {
    color: colors.safe,
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '45%',
    textAlign: 'right',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  description: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  callButton: {
    backgroundColor: colors.safe,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
  },
  actionText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
