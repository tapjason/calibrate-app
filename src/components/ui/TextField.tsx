import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  testID?: string;
  accessibilityLabel?: string;
  /** Credential fields: passwords, and email keyboards without autocorrect. */
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  maxLength,
  testID,
  accessibilityLabel,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
}: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={accessibilityLabel ?? label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={secureTextEntry || keyboardType === 'email-address' ? false : undefined}
        style={[styles.input, multiline && styles.multiline]}
      />
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
