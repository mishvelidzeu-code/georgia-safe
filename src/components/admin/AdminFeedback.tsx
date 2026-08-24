import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../../theme/colors';
import { adminStyles as s } from './adminStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { fetchAdminReviews, fetchZoneFeedback } from '../../lib/admin';
import type { AdminReview, ZoneFeedbackTally } from '../../lib/admin';

/**
 * Read-only view of the two anonymous feedback streams the app collects but
 * has never shown anyone: zone safe/unsafe votes (aggregated) and place
 * reviews. Deliberately has no edit or delete controls — see the RLS
 * migration, which grants the admin SELECT on these tables and nothing else.
 */
export default function AdminFeedback() {
  const { t } = useLanguage();
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [votes, setVotes] = useState<ZoneFeedbackTally[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [reviewResult, voteResult] = await Promise.allSettled([
      fetchAdminReviews(),
      fetchZoneFeedback(),
    ]);
    setReviews(reviewResult.status === 'fulfilled' ? reviewResult.value : []);
    setVotes(voteResult.status === 'fulfilled' ? voteResult.value : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 32 }} color={colors.text} />;
  }

  return (
    <FlatList
      style={s.list}
      contentContainerStyle={s.listContent}
      data={reviews}
      keyExtractor={(item) => item.id}
      onRefresh={load}
      refreshing={loading}
      ListHeaderComponent={
        <View style={[s.card, { marginBottom: 8 }]}>
          <Text style={s.cardTitle}>{t('admin.zoneVotes')}</Text>
          {votes.length === 0 ? (
            <Text style={s.cardMeta}>{t('admin.noVotes')}</Text>
          ) : (
            votes.map((vote) => (
              <Text key={vote.zoneId} style={s.cardBody}>
                {vote.zoneId} — <Text style={{ color: colors.safe }}>▲ {vote.safe}</Text>{' '}
                <Text style={{ color: colors.risk }}>▼ {vote.unsafe}</Text>
              </Text>
            ))
          )}
        </View>
      }
      ListEmptyComponent={<Text style={s.empty}>{t('admin.noReviews')}</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          <Text style={s.cardTitle}>
            {'★'.repeat(item.rating)}
            {'☆'.repeat(5 - item.rating)} · {item.placeName}
          </Text>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={s.photo} contentFit="cover" />
          ) : null}
          {item.comment ? <Text style={s.cardBody}>{item.comment}</Text> : null}
          <Text style={s.cardMeta}>
            {item.placeType} · {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      )}
    />
  );
}
