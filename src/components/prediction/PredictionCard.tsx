import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Prediction } from '@/types';

interface PredictionCardProps {
  prediction: Prediction;
  onPress?: (id: string) => void;
}

export function PredictionCard({ prediction, onPress }: PredictionCardProps) {
  const due = prediction.due_date.slice(0, 10);
  const statusLabel: Record<Prediction['status'], string> = {
    pending: 'Pending',
    resolved_yes: 'Yes ✓',
    resolved_no: 'No ✗',
    skipped: 'Skipped',
  };

  return (
    <Pressable
      onPress={() => onPress?.(prediction.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.category}>{prediction.category}</Text>
        <Text style={styles.confidence}>{prediction.confidence}%</Text>
      </View>
      <Text style={styles.title}>{prediction.title}</Text>
      <View style={styles.footer}>
        <Text style={styles.due}>due {due}</Text>
        <Text style={styles.status}>{statusLabel[prediction.status]}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: 'white',
  },
  pressed: { opacity: 0.7 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  category: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase' },
  confidence: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 16, color: '#111827', marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  due: { fontSize: 13, color: '#6b7280' },
  status: { fontSize: 13, color: '#374151', fontWeight: '500' },
});
