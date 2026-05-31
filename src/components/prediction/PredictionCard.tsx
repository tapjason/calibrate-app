import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Prediction } from '@/types';

interface PredictionCardProps {
  prediction: Prediction;
  onPress?: (id: string) => void;
}

/** A pending prediction whose due date is on a calendar day before today. */
function isOverdue(prediction: Prediction): boolean {
  if (prediction.status !== 'pending') return false;
  const d = new Date(prediction.due_date);
  const startOfDueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return startOfDueDay < startOfToday;
}

export function PredictionCard({ prediction, onPress }: PredictionCardProps) {
  const due = new Date(prediction.due_date).toLocaleDateString();
  const overdue = isOverdue(prediction);
  const statusLabel: Record<Prediction['status'], string> = {
    pending: overdue ? 'Overdue' : 'Pending',
    resolved_yes: 'Yes ✓',
    resolved_no: 'No ✗',
    skipped: 'Skipped',
  };

  return (
    <Pressable
      testID={`prediction-card-${prediction.id}`}
      onPress={() => onPress?.(prediction.id)}
      style={({ pressed }) => [styles.card, overdue && styles.cardOverdue, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.category}>{prediction.category}</Text>
        <Text style={styles.confidence}>{prediction.confidence}%</Text>
      </View>
      <Text style={styles.title}>{prediction.title}</Text>
      <View style={styles.footer}>
        <Text style={[styles.due, overdue && styles.overdueText]}>due {due}</Text>
        <Text style={[styles.status, overdue && styles.overdueText]}>
          {statusLabel[prediction.status]}
        </Text>
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
  cardOverdue: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  pressed: { opacity: 0.7 },
  overdueText: { color: '#b45309', fontWeight: '600' },
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
