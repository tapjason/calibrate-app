import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';
import type { Category } from '@/types';

export interface StarterIdea {
  title: string;
  category: Category;
  /**
   * The Log form's due chip the title implies (roadmap step 94). Every idea
   * resolves by tomorrow evening (D18 (4)), so a first prediction's result
   * arrives on Day 1, not a week later.
   */
  due: 'tomorrow' | 'week';
}

/**
 * One per category, each checkable by tomorrow evening and none naming a weekday or
 * a date (the due date carries that, and picking one sets it). Ordinary on
 * purpose: the point is to show what a prediction looks like, not to suggest
 * what to want.
 */
export const STARTER_IDEAS: readonly StarterIdea[] = [
  { title: "I'll finish my most important task tomorrow", category: 'work', due: 'tomorrow' },
  { title: "I'll get outside for a walk tomorrow", category: 'health', due: 'tomorrow' },
  { title: "I won't buy anything unplanned tomorrow", category: 'finance', due: 'tomorrow' },
  { title: 'A friend I message today replies the same day', category: 'social', due: 'tomorrow' },
  { title: "I'll read before bed tomorrow night", category: 'personal', due: 'tomorrow' },
];

interface StarterIdeasProps {
  onPick: (idea: StarterIdea) => void;
}

/**
 * For a first prediction only (roadmap step 40): a blank title field is the
 * hardest part of the first log, and the Warmup's "Make a real prediction"
 * lands right on it. Tapping one fills the title, category and due date; the
 * confidence is still the user's to set, which is the part that matters.
 */
export function StarterIdeas({ onPick }: StarterIdeasProps) {
  return (
    <View style={styles.wrap} testID="starter-ideas">
      <Text style={styles.label}>Not sure where to start? Try one, then make it yours:</Text>
      {STARTER_IDEAS.map((idea) => (
        <Pressable
          key={idea.category}
          onPress={() => onPick(idea)}
          accessibilityRole="button"
          accessibilityLabel={`Use: ${idea.title}`}
          style={({ pressed }) => [styles.idea, pressed && styles.pressed]}
          testID={`starter-${idea.category}`}
        >
          <CategoryIcon category={idea.category} size={14} color={colors.textSecondary} />
          <Text style={styles.ideaText}>{idea.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginBottom: space.xl },
  label: { ...type.footnote, color: colors.textSecondary },
  idea: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  pressed: { opacity: 0.6 },
  ideaText: { ...type.subhead, color: colors.textPrimary, flex: 1 },
});
