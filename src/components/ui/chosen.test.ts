import { Platform } from 'react-native';

import { chosenProps } from './chosen';

describe('chosenProps (roadmap step 96)', () => {
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
  });

  it('gives iOS the accessibilityState it reads, and nothing else', () => {
    Platform.OS = 'ios';
    expect(chosenProps('radio', true)).toEqual({ accessibilityState: { selected: true } });
    expect(chosenProps('checkbox', false)).toEqual({ accessibilityState: { checked: false } });
    expect(chosenProps('radio', false, true)).toEqual({
      accessibilityState: { selected: false, disabled: true },
    });
  });

  // react-native-web drops accessibilityState: the aria-* prop is what
  // reaches the DOM, and each role has its own.
  it('adds the attribute each role expects on web', () => {
    Platform.OS = 'web';
    expect(chosenProps('radio', true)['aria-checked']).toBe(true);
    expect(chosenProps('checkbox', false)['aria-checked']).toBe(false);
    expect(chosenProps('tab', true)['aria-selected']).toBe(true);
    expect(chosenProps('toggle', true)['aria-pressed']).toBe(true);
    expect(chosenProps('radio', false, true)['aria-disabled']).toBe(true);
    expect(chosenProps('radio', false, false)['aria-disabled']).toBeUndefined();
  });

  it('keeps one attribute per role on web', () => {
    Platform.OS = 'web';
    const tab = chosenProps('tab', true);
    expect(tab['aria-checked']).toBeUndefined();
    expect(tab['aria-pressed']).toBeUndefined();
  });
});
