import { useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { CategoryIcon } from '@/components/ui/Icon';
import { LengthCounter } from '@/components/ui/LengthCounter';
import { TextButton } from '@/components/ui/TextButton';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { CUSTOM_CATEGORY_SYNC } from '@/constants/app';
import { colors, radius, space, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import {
  CATEGORY_NAME_MAX,
  categoryLabel,
  categoryNameProblem,
  categoryIcon,
  categoryTitle,
  categoryOptions,
  isCategoryHidden,
  useCategoryStore,
} from '@/store/categoryStore';
import { fitEdit, graphemeLength, unitBackstop } from '@/store/text';
import { isBuiltInCategory, type Category } from '@/types';

import { CategoryIconEditor } from './CategoryIconEditor';

/**
 * Categories (roadmap D39, decided 2026-11-01): rename any of them, add your
 * own, and hide one from Log's choices. Four blind testers wanted "Family",
 * "Research" or "Grad school", and the five fixed ones misfiled their
 * predictions. Since D40 (2026-11-03) the icon at the start of each row opens
 * its icon editor: an emoji or a picture. A hidden category keeps its predictions and record; nothing is
 * deleted here.
 */
export function CategoryManager() {
  useCategoryStore((s) => s.defs);
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const [editing, setEditing] = useState<Category | null>(null);
  const [iconFor, setIconFor] = useState<Category | null>(null);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const all = categoryOptions({ includeHidden: true });
  const shown = categoryOptions();
  const hasOwn = all.some((c) => !isBuiltInCategory(c));

  // About six letters of name at the current text size: past that, Rename and
  // the switch wrap under it rather than leave "Gr…" (review, 2026-11-08).
  const { fontScale } = useWindowDimensions();
  const nameFloor = Math.round(48 * Math.max(fontScale, 1));

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
      // Said, not only drawn (playtest 2026-11-08, finding 38).
      AccessibilityInfo.announceForAccessibility(`Renamed to ${categoryTitle(id)}.`);
    });

  const add = () =>
    run(async () => {
      await useCategoryStore.getState().add(newName);
      AccessibilityInfo.announceForAccessibility(`Added ${newName.trim()}.`);
      setNewName('');
    });

  const addProblem = newName.trim().length > 0 ? categoryNameProblem(newName) : null;

  return (
    <View style={styles.wrap} testID="category-manager">
      <Text accessibilityRole="header" style={styles.title}>
        Categories
      </Text>
      <Text style={styles.body}>
        Rename any category, give it an icon, add your own, or hide one from the choices when you
        log. A hidden category keeps its predictions and its record.
      </Text>

      <View style={styles.card}>
        {all.map((c, i) => {
          const hidden = isCategoryHidden(c);
          const name = categoryTitle(c);
          return (
            <View key={c} style={i > 0 && styles.rowDivider}>
              <View style={styles.row} testID={`manage-${c}`}>
                {editing === c ? (
                  <View style={styles.editing}>
                    <TextInput
                      value={draft}
                      onChangeText={(t) => setDraft(fitEdit(draft, t, CATEGORY_NAME_MAX))}
                      autoFocus
                      maxLength={unitBackstop(CATEGORY_NAME_MAX)}
                      accessibilityLabel={`New name for ${name}`}
                      placeholderTextColor={colors.textTertiary}
                      style={styles.input}
                      onSubmitEditing={() => void saveRename(c)}
                      returnKeyType="done"
                      testID={`manage-${c}-input`}
                    />
                    <LengthCounter length={graphemeLength(draft)} max={CATEGORY_NAME_MAX} />
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
                    {/* The icon and the name as one: the name never ends up on a
                        line apart from its icon. */}
                    <View style={styles.head}>
                      <Pressable
                        style={styles.iconButton}
                        onPress={() => {
                          setIconFor(iconFor === c ? null : c);
                          setError(null);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${name} icon: ${iconWords(c)}. Change`}
                        accessibilityState={{ expanded: iconFor === c }}
                        testID={`manage-${c}-icon`}
                      >
                        {/* A hidden row is dimmed, icon and name, so it reads as
                            off before the switch is found (playtest 2026-11-08,
                            finding 21). */}
                        <View style={hidden && styles.dimmed}>
                          <CategoryIcon category={c} size={22} color={colors.textSecondary} />
                        </View>
                      </Pressable>
                      <Text
                        style={[styles.name, { minWidth: nameFloor }, hidden && styles.nameHidden]}
                        numberOfLines={2}
                      >
                        {name}
                      </Text>
                    </View>
                    {/* Rename and the switch keep together: when the whole name
                        can't sit beside them they wrap under it as a pair, at the
                        row's end (playtest 2026-11-08b, finding 17). */}
                    <View style={styles.controls}>
                      {/* Its own button, not grey text after the name (first device
                          run, 2026-11-07: it read as part of the label). Ink on a
                          sunken pill: the brand has no hue for actions (D33). */}
                      <Pressable
                        style={({ pressed }) => [styles.renameButton, pressed && styles.renamePressed]}
                        hitSlop={6}
                        onPress={() => {
                          setDraft(name);
                          setEditing(c);
                          setError(null);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${name}. Rename`}
                        testID={`manage-${c}-rename`}
                      >
                        <Text style={styles.renameLabel}>Rename</Text>
                      </Pressable>
                      {/* On = offered when logging. The whole switch is one element.
                          Boxed at the row's 44pt height and centred in it: on the
                          iPhone the bare switch sat above the row's centre line
                          (first device run, 2026-11-07). */}
                      <View style={styles.switchBox}>
                        <ToggleSwitch
                          value={!hidden}
                          // The last one offered stays on: logging needs a category.
                          disabled={!hidden && shown.length === 1}
                          onValueChange={(on) =>
                            void run(() => useCategoryStore.getState().setHidden(c, !on))
                          }
                          accessibilityLabel={`Offer ${name} when logging`}
                          accessibilityHint={
                            !hidden && shown.length === 1 ? LAST_SHOWN_NOTE : undefined
                          }
                          testID={`manage-${c}-shown`}
                        />
                      </View>
                    </View>
                  </>
                )}
              </View>
              {iconFor === c && (
                <View style={styles.rowDivider}>
                  <CategoryIconEditor category={c} name={name} onDone={() => setIconFor(null)} />
                </View>
              )}
            </View>
          );
        })}
      </View>
      <Text style={styles.footnote}>The switch offers a category when you log.</Text>
      {/* The last switch on can't be turned off: said, not silent (playtest
          2026-11-08, finding 21). */}
      {shown.length === 1 && (
        <Text style={styles.footnote} testID="manage-last-shown">
          {LAST_SHOWN_NOTE}
        </Text>
      )}

      {error && (
        <Text style={styles.error} testID="manage-error">
          {error}
        </Text>
      )}

      <Text style={styles.label}>Add a category</Text>
      <TextInput
        value={newName}
        onChangeText={(t) => setNewName(fitEdit(newName, t, CATEGORY_NAME_MAX))}
        maxLength={unitBackstop(CATEGORY_NAME_MAX)}
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
      <LengthCounter length={graphemeLength(newName)} max={CATEGORY_NAME_MAX} testID="manage-new-count" />
      {addProblem && <Text style={styles.footnote}>{addProblem}</Text>}
      <Button
        label="Add"
        variant="secondary"
        onPress={() => void add()}
        disabled={busy || newName.trim().length === 0 || addProblem !== null}
        testID="manage-add"
      />
      {/* Honest about backup (roadmap D39): while CUSTOM_CATEGORY_SYNC is off,
          predictions filed under an added category stay on this phone. */}
      {!CUSTOM_CATEGORY_SYNC && signedIn && hasOwn && (
        <Text style={styles.footnote} testID="manage-local-note">
          Predictions in your own categories stay on this phone for now: they don’t back up to your
          account yet.
        </Text>
      )}
    </View>
  );
}

const LAST_SHOWN_NOTE = 'One category stays on: logging needs one.';

/**
 * The icon as said aloud: "X icon. Change" didn't say which icon it was
 * (playtest 2026-11-08b, finding 29).
 */
function iconWords(c: Category): string {
  const own = categoryIcon(c);
  if (own?.kind === 'emoji') return own.emoji;
  if (own?.kind === 'image') return 'your picture';
  return 'the default';
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
  // Rename and the switch wrap under a name they'd cut (playtest 2026-11-03,
  // run 3; 2026-11-08b, finding 17). 4pt gaps and a 12pt edge keep a short
  // name on one line with them at 320 wide, beside the iOS 26 switch (63pt;
  // the web's is 40).
  row: {
    alignItems: 'center',
    columnGap: space.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    rowGap: space.sm,
  },
  rowDivider: {
    borderTopColor: colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    alignItems: 'center',
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    // 8pt from the icon to the name.
    marginRight: space.sm,
    width: 44,
  },
  // The icon and name at their own width, then what's left: a name too long to sit
  // beside Rename and the switch sends them to a line of their own, so it is
  // read whole instead of "Hot girl w…" (playtest 2026-11-08b, finding 17:
  // 13 of Rosa's 20 names were cut at 320). Two lines at most, past which it
  // ends in an ellipsis.
  head: {
    alignItems: 'center',
    flexBasis: 'auto',
    flexDirection: 'row',
    flexGrow: 1,
    flexShrink: 1,
  },
  name: { ...type.callout, color: colors.textPrimary, flexShrink: 1 },
  controls: {
    alignItems: 'center',
    columnGap: space.xs,
    flexDirection: 'row',
    marginLeft: 'auto',
  },
  nameHidden: { color: colors.textTertiary },
  dimmed: { opacity: 0.45 },
  renameButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.controlBorder,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: space.sm,
  },
  renamePressed: { opacity: 0.6 },
  renameLabel: { ...type.footnote, color: colors.action, fontWeight: '600' },
  switchBox: { alignItems: 'center', height: 44, justifyContent: 'center' },
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
  label: {
    ...type.footnote,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: space.lg,
  },
  footnote: { ...type.footnote, color: colors.textSecondary },
  error: { ...type.subhead, color: colors.destructive },
});
