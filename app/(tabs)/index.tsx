import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { PredictionCard } from '@/components/prediction/PredictionCard';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';

export default function HomeScreen() {
  const router = useRouter();
  const pending = usePredictionStore((s) => s.pending);
  const userStat = useStatsStore((s) => s.userStat);
  const headline = ratingHeadline(userStat);

  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        {!headline ? (
          <>
            <Text style={styles.summaryNumber}>—</Text>
            <Text style={styles.summaryLabel}>calibration rating</Text>
          </>
        ) : headline.provisional ? (
          <>
            <Text style={styles.summaryNumber}>{headline.remaining}</Text>
            <Text style={styles.summaryLabel}>
              {headline.remaining === 1 ? 'resolution' : 'resolutions'} until your
              rating unlocks
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.summaryNumber}>{headline.rating}</Text>
            <Text style={styles.summaryLabel}>calibration rating</Text>
          </>
        )}
      </View>
      <Text style={styles.sectionTitle}>Open predictions</Text>
      {pending.length === 0 ? (
        <Text style={styles.empty}>
          No predictions yet. Add one from the Log tab.
        </Text>
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PredictionCard
              prediction={item}
              onPress={(id) => router.push(`/resolve/${id}` as never)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  summary: { alignItems: 'center', marginBottom: 24 },
  summaryNumber: { fontSize: 56, fontWeight: '700', color: '#2563eb' },
  summaryLabel: { fontSize: 14, color: '#6b7280' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  empty: { color: '#9ca3af', fontStyle: 'italic' },
});
