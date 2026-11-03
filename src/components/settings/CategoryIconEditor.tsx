import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { CategoryIcon } from '@/components/ui/Icon';
import { TextButton } from '@/components/ui/TextButton';
import { SUGGESTED_CATEGORY_EMOJI } from '@/constants/categoryIcons';
import { colors, radius, space, type } from '@/constants/theme';
import { pickIconImage } from '@/media/iconImage';
import { categoryEmojiProblem, useCategoryStore } from '@/store/categoryStore';
import type { Category } from '@/types';

/**
 * A category's icon (roadmap D40, decided 2026-11-03): one of the suggested
 * emoji, any emoji typed in, or a picture from the library, for a built-in as
 * much as for one the person added. "Use the default" goes back to the
 * category's own symbol. The icon is the person's own and stays on this
 * phone; share cards keep their fixed design.
 */
export function CategoryIconEditor({
  category,
  name,
  onDone,
}: {
  category: Category;
  name: string;
  onDone: () => void;
}) {
  const current = useCategoryStore((s) => s.defs.find((d) => d.id === category)?.icon ?? null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const typedProblem = typed.trim().length > 0 ? categoryEmojiProblem(typed) : null;

  const save = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const useEmoji = (emoji: string) =>
    save(async () => {
      await useCategoryStore.getState().setIcon(category, { kind: 'emoji', emoji });
      setTyped('');
    });

  const choosePicture = () =>
    save(async () => {
      const result = await pickIconImage();
      if (result.status === 'cancelled') return;
      if (result.status === 'failed') {
        setError("That picture couldn't be used. Try another.");
        return;
      }
      await useCategoryStore.getState().setIcon(category, { kind: 'image', uri: result.uri });
    });

  const useDefault = () => save(() => useCategoryStore.getState().setIcon(category, null));

  return (
    <View style={styles.wrap} testID={`icon-editor-${category}`}>
      <View style={styles.heading}>
        <CategoryIcon category={category} size={28} color={colors.textSecondary} />
        <Text accessibilityRole="header" style={styles.title}>
          Icon for {name}
        </Text>
      </View>

      <View style={styles.grid} accessibilityRole="radiogroup">
        {SUGGESTED_CATEGORY_EMOJI.map((emoji) => {
          const selected = current?.kind === 'emoji' && current.emoji === emoji;
          return (
            <Pressable
              key={emoji}
              onPress={() => void useEmoji(emoji)}
              disabled={busy}
              style={[styles.cell, selected && styles.cellSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: busy }}
              accessibilityLabel={emoji}
              testID={`icon-emoji-${emoji}`}
            >
              <Text allowFontScaling={false} style={styles.emoji}>
                {emoji}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Or any emoji</Text>
      <View style={styles.typedRow}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          maxLength={16}
          placeholder="Type or paste one"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={`Any emoji for ${name}`}
          style={styles.input}
          onSubmitEditing={() => {
            if (typed.trim() && !typedProblem) void useEmoji(typed);
          }}
          returnKeyType="done"
          testID="icon-emoji-input"
        />
        <Button
          label="Use"
          variant="secondary"
          onPress={() => void useEmoji(typed)}
          disabled={busy || typed.trim().length === 0 || typedProblem !== null}
          testID="icon-emoji-use"
        />
      </View>
      {typedProblem && <Text style={styles.footnote}>{typedProblem}</Text>}

      <Button
        label={current?.kind === 'image' ? 'Choose another picture' : 'Choose a picture'}
        variant="secondary"
        onPress={() => void choosePicture()}
        disabled={busy}
        testID="icon-picture"
      />
      <Text style={styles.footnote}>
        Pictures stay on this phone. Share cards keep their own look.
      </Text>

      {error && (
        <Text style={styles.error} testID="icon-error">
          {error}
        </Text>
      )}

      <View style={styles.actions}>
        {current && (
          <TextButton
            label="Use the default"
            onPress={() => void useDefault()}
            testID="icon-default"
          />
        )}
        <TextButton label="Done" onPress={onDone} testID="icon-done" />
      </View>
    </View>
  );
}

const CELL = 44;

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  heading: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  title: { ...type.headline, color: colors.textPrimary, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cell: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radius.sm,
    borderWidth: 2,
    height: CELL,
    justifyContent: 'center',
    width: CELL,
  },
  cellSelected: { borderColor: colors.action },
  emoji: { color: colors.textPrimary, fontSize: 24, lineHeight: 30 },
  label: {
    ...type.footnote,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: space.xs,
  },
  typedRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  input: {
    ...type.callout,
    backgroundColor: colors.surface,
    borderColor: colors.controlBorder,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.textPrimary,
    flex: 1,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  footnote: { ...type.footnote, color: colors.textSecondary },
  error: { ...type.subhead, color: colors.destructive },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.lg,
    justifyContent: 'flex-end',
  },
});
