import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BADGE_META } from '@/constants/badges';
import { APP_NAME } from '@/constants/app';
import type { ShareCard } from '@/types';

import { shareHeadline, shareSubline } from './cardCopy';

interface IdentityCardProps {
  card: ShareCard;
}

/**
 * The category identity card — the app's core shareable artifact.
 *
 * Built from plain Views rather than SVG: react-native-view-shot rasterizes
 * the native view tree, so what the user sees on screen is exactly what lands
 * in the PNG, with no second rendering path to keep in sync.
 *
 * Fixed aspect and generous padding because this is screenshot-native: it has
 * to stay legible as a thumbnail in a chat thread. The "get your own" footer
 * is the growth hook and is never removed — this card is free forever, and it
 * is the marketing budget.
 *
 * Forwards a ref so the screen can hand the whole card to captureCard().
 */
export const IdentityCard = forwardRef<View, IdentityCardProps>(
  function IdentityCard({ card }, ref) {
    return (
      <View ref={ref} style={styles.card} testID="identity-card" collapsable={false}>
        <Text style={styles.eyebrow}>My calibration</Text>

        <Text style={styles.headline}>{shareHeadline(card)}</Text>
        <Text style={styles.subline}>{shareSubline(card)}</Text>

        <View style={styles.badges}>
          {card.categories.map((c) => {
            const meta = BADGE_META[c.badge_level];
            return (
              <View
                key={c.category}
                testID={`card-badge-${c.category}`}
                style={[styles.chip, { backgroundColor: meta.background }]}
              >
                <Text style={styles.chipEmoji}>{meta.emoji}</Text>
                <Text style={[styles.chipLabel, { color: meta.color }]}>
                  {c.category}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerMark}>{APP_NAME}</Text>
          <Text style={styles.footerHook}>Find out where your judgment holds up</Text>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    gap: 10,
    padding: 24,
  },
  eyebrow: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headline: { color: '#f8fafc', fontSize: 26, fontWeight: '800', lineHeight: 32 },
  subline: { color: '#94a3b8', fontSize: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  footer: {
    borderTopColor: '#1e293b',
    borderTopWidth: 1,
    gap: 2,
    marginTop: 14,
    paddingTop: 14,
  },
  footerMark: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  footerHook: { color: '#64748b', fontSize: 12 },
});
