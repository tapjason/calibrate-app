import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { CategoryIcon } from '@/components/ui/Icon';
import { TextButton } from '@/components/ui/TextButton';
import { colors, radius, space, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import {
  CATEGORY_NAME_MAX,
  categoryLabel,
  categoryNameProblem,
  categoryTitle,
  categoryOptions,
  isCategoryHidden,
  useCategoryStore,
} from '@/store/categoryStore';
import { isBuiltInCategory, type Category } from '@/types';

/**
 * Categories (roadmap D39, decided 2026-11-01): rename any of them, add your
 * own, and hide one from Log's choices. Four blind testers wanted "Family",
 * "Research" or "Grad school", and the five fixed ones misfiled their
 * predictions. A hidden category keeps its predictions and record; nothing is
 * deleted here.
 */
export function CategoryManager() {
  useCategoryStore((s) => s.defs);
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const [editing, setEditing] = useState<Category | null>(null);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const all = categoryOptions({ includeHidden: true });
  const shown = categoryOptions();
  const hasOwn = all.some((c) => !isBuiltInCategory(c));

  const run = async (work: () => Promise<void>) => {
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

  const saveRename = (id: Category) =>
    run(async () => {
      await useCategoryStore.getState().rename(id, draft);
      setEditing(null);
    });

  const add = () =>
    run(async () => {
      await useCategoryStore.getState().add(newName);
      setNewName('');
    });

  const addProblem = newName.trim().length > 0 ? categoryNameProblem(newName) : null;

  return (
    <View style={styles.wrap} testID="category-manager">
      <Text accessibilityRole="header" style={styles.title}>
        Categories
      </Text>
      <Text style={styles.body}>
        Rename any category, add your own, or hide one from the choices when you log. A hidden
        category keeps its predictions and its record.
      </Text>

      <View style={styles.card}>
        {all.map((c, i) => {
          const hidden = isCategoryHidden(c);
          const name = categoryTitle(c);
          return (
            <View
              key={c}
              style={[styles.row, i > 0 && styles.rowDivider]}
              testID={`manage-${c}`}
            >
              {editing === c ? (
                <View style={styles.editing}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    autoFocus
                    maxLength={CATEGORY_NAME_MAX}
                    accessibilityLabel={`New name for ${name}`}
                    placeholderTextColor={colors.textTertiary}
                    style={styles.input}
                    onSubmitEditing={() => void saveRename(c)}
                    returnKeyType="done"
                    testID={`manage-${c}-input`}
                  />
                  <View style={styles.editActions}>
                    <Button
                      label="Save"
                      onPress={() => void saveRename(c)}
                      disabled={busy || categoryNameProblem(draft, c) !== null}
                      testID={`manage-${c}-save`}
                    />
                    <TextButton
                      label="Cancel"
                      onPress={() => {
                        setEditing(null);
                        setError(null);
                      }}
                      testID={`manage-${c}-cancel`}
                    />
                  </View>
                </View>
              ) : (
                <>
                  <Pressable
                    style={styles.nameButton}
                    onPress={() => {
                      setDraft(name);
                      setEditing(c);
                      setError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}. Rename`}
                    testID={`manage-${c}-rename`}
                  >
                    <CategoryIcon category={c} size={16} color={colors.textSecondary} />
                    <Text style={[styles.name, hidden && styles.nameHidden]}>{name}</Text>
                    <Text style={styles.renameHint}>Rename</Text>
                  </Pressable>
                  {/* On = offered when logging. The whole switch is one element. */}
                  <Switch
                    value={!hidden}
                    // The last one offered stays on: logging needs a category.
                    disabled={!hidden && shown.length === 1}
                    onValueChange={(on) =>
                      void run(() => useCategoryStore.getState().setHidden(c, !on))
                    }
                    accessibilityLabel={`Offer ${name} when logging`}
                    trackColor={{ true: colors.action, false: colors.controlBorder }}
                    thumbColor={colors.onAction}
                    ios_backgroundColor={colors.controlBorder}
                    {...{ activeThumbColor: colors.onAction }}
                    testID={`manage-${c}-shown`}
                  />
                </>
              )}
            </View>
          );
        })}
      </View>
      <Text style={styles.footnote}>The switch offers a category when you log.</Text>

      {error && (
        <Text style={styles.error} testID="manage-error">
          {error}
        </Text>
      )}

      <Text style={styles.label}>Add a category</Text>
      <TextInput
        value={newName}
        onChangeText={setNewName}
        maxLength={CATEGORY_NAME_MAX}
        placeholder="e.g. Family"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="New category name"
        style={styles.input}
        onSubmitEditing={() => {
          if (!addProblem && newName.trim()) void add();
        }}
        returnKeyType="done"
        testID="manage-new-name"
      />
      {addProblem && <Text style={styles.footnote}>{addProblem}</Text>}
      <Button
        label="Add"
        variant="secondary"
        onPress={() => void add()}
        disabled={busy || newName.trim().length === 0 || addProblem !== null}
        testID="manage-add"
      />
      {/* Honest about backup (roadmap D39): the server only knows the five
          built-ins until its migration is applied, so predictions filed under
          an added category stay on this phone. */}
      {signedIn && hasOwn && (
        <Text style={styles.footnote} testID="manage-local-note">
          Predictions in your own categories stay on this phone for now: they don’t back up to
          your account yet.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, padding: space.lg, paddingBottom: space.huge },
  title: { ...type.title2, color: colors.textPrimary },
  body: { ...type.body, color: colors.textSecondary, marginBottom: space.sm },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  rowDivider: { borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth },
  nameButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: space.sm, minHeight: 44 },
  name: { ...type.callout, color: colors.textPrimary, flexShrink: 1 },
  nameHidden: { color: colors.textSecondary },
  renameHint: { ...type.footnote, color: colors.textSecondary },
  editing: { flex: 1, gap: space.sm, paddingVertical: space.xs },
  editActions: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  input: {
    ...type.callout,
    backgroundColor: colors.surface,
    borderColor: colors.controlBorder,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.textPrimary,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  label: { ...type.footnote, color: colors.textSecondary, fontWeight: '500', marginTop: space.lg },
  footnote: { ...type.footnote, color: colors.textSecondary },
  error: { ...type.subhead, color: colors.destructive },
});
