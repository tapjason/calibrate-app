import { render, screen } from '@testing-library/react-native';

import { SectionHeader } from './SectionHeader';

// Roadmap D33: "Ready to resolve · 10" became a heading with the count apart.
describe('SectionHeader', () => {
  it('sets the count apart instead of joining it with a dot', () => {
    render(<SectionHeader title="Ready to resolve" count={10} />);
    expect(screen.getByText('Ready to resolve')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('reads as one heading with its count', () => {
    render(<SectionHeader title="Open" count={3} testID="h" />);
    const header = screen.getByTestId('h');
    expect(header.props.accessibilityRole).toBe('header');
    expect(header.props.accessibilityLabel).toBe('Open, 3');
  });

  it('can stand without a count', () => {
    render(<SectionHeader title="Category badges" testID="h" />);
    expect(screen.getByTestId('h').props.accessibilityLabel).toBe('Category badges');
  });

  // Playtest 2026-11-08b, finding 29: "Next 7 days, 7" said nothing of what.
  it('says what the count counts when given a unit', () => {
    render(
      <SectionHeader title="Next 7 days" count={7} unit={{ one: 'prediction', other: 'predictions' }} testID="h" />,
    );
    expect(screen.getByTestId('h').props.accessibilityLabel).toBe('Next 7 days, 7 predictions');
  });

  it('uses the singular for one', () => {
    render(<SectionHeader title="Open" count={1} unit={{ one: 'prediction', other: 'predictions' }} testID="h" />);
    expect(screen.getByTestId('h').props.accessibilityLabel).toBe('Open, 1 prediction');
  });
});
