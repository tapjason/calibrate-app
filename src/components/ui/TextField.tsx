import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';
import { fitEdit, graphemeLength, unitBackstop } from '@/store/text';

import { LengthCounter } from './LengthCounter';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  /**
   * One line that wraps and grows as it fills, for a sentence such as a
   * prediction: a one-line field scrolled a long one out of view as it was
   * typed (blind playtest 2026-11-01). Return closes the keyboard, and a
   * pasted line break becomes a space, so it stays one line of text.
   */
  grows?: boolean;
  maxLength?: number;
  testID?: string;
  accessibilityLabel?: string;
  /** Credential fields: passwords, and email keyboards without autocorrect. */
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  /** Focus on mount: a field that appears on a tap, where the tap was. */
  autoFocus?: boolean;
  /** Return submits (one-line fields only): its key reads Done. */
  onSubmit?: () => void;
  /**
   * A line under the input, inside the field's spacing so it reads as the
   * field's own (Log's past outcomes, roadmap D32).
   */
  children?: ReactNode;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  grows,
  maxLength,
  testID,
  accessibilityLabel,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  autoFocus,
  onSubmit,
  children,
}: TextFieldProps) {
  const input = useRef<TextInput>(null);
  // The limit counts characters as a person sees them, and the cut never
  // splits an emoji (playtest 2026-11-08b, finding 6); the input's own
  // maxLength, in UTF-16 units, is only a backstop against a huge paste.
  const change = (next: string) => {
    const flat = grows ? next.replace(/\s*[\r\n]+\s*/g, ' ') : next;
    onChangeText(maxLength === undefined ? flat : fitEdit(value, flat, maxLength));
  };
  // iOS sizes a multiline input to its text; a browser's textarea keeps the
  // height it was given, so on web it is measured to its text here. A
  // multiline note too: 500 characters sat in an 80pt box (playtest
  // 2026-11-08b, finding 27).
  const sized = grows || multiline;
  const fit = useCallback(() => {
    if (!sized || Platform.OS !== 'web') return;
    const node = input.current as unknown as HTMLTextAreaElement | null;
    if (!node?.style) return;
    node.style.height = 'auto';
    // border-box (react-native-web's input reset): the text and padding,
    // plus the 1pt border above and below.
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [sized]);
  useLayoutEffect(fit, [fit, value]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={input}
        testID={testID}
        accessibilityLabel={accessibilityLabel ?? label}
        value={value}
        onChangeText={change}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline || grows}
        // Return is Done, never a line break: iOS by submitBehavior, the web
        // build by blurOnSubmit, which keeps the break only with a handler.
        submitBehavior={grows ? 'blurAndSubmit' : undefined}
        blurOnSubmit={grows ? true : undefined}
        onSubmitEditing={grows ? () => {} : onSubmit}
        returnKeyType={grows || onSubmit ? 'done' : undefined}
        autoFocus={autoFocus}
        scrollEnabled={grows ? false : undefined}
        onLayout={sized ? fit : undefined}
        // react-native-web's textarea starts at two rows; one, like the
        // single-line field it replaces. Native ignores it.
        {...(grows ? { rows: 1 } : null)}
        maxLength={maxLength === undefined ? undefined : unitBackstop(maxLength)}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={secureTextEntry || keyboardType === 'email-address' ? false : undefined}
        style={[styles.input, multiline && styles.multiline]}
      />
      {maxLength !== undefined && (
        <LengthCounter
          length={graphemeLength(value)}
          max={maxLength}
          testID={testID ? `${testID}-count` : undefined}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  input: {
    // controlBorder: an input's edge is a UI boundary and needs 3:1 (the old
    // #d1d5db was about 1.5:1 on white).
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    ...type.callout,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
