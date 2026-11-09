import { fireEvent, render, screen } from '@testing-library/react-native';

import { useCategoryStore } from '@/store/categoryStore';
import type { Category, CategoryDef } from '@/types';

import { CATEGORY_CHIPS_SETTLE_MS, CategoryChips } from './CategoryChips';

/** Five built-ins plus `n` added, so the row collapses past eight. */
function addCategories(n: number) {
  const defs: CategoryDef[] = Array.from({ length: n }, (_, i) => ({
    id: `c-${i}` as Category,
    user_id: 'u1',
    name: `Added ${i}`,
    icon: null,
    hidden: false,
    position: i,
    created_at: '2026-11-01T00:00:00.000Z',
  }));
  useCategoryStore.setState({ defs });
}

afterEach(() => {
  useCategoryStore.setState({ defs: [] });
  jest.restoreAllMocks();
});

describe('CategoryChips with many categories', () => {
  // Playtest 2026-11-08b, finding 4: the second tap of a double tap on
  // "N more" chose the chip that slid under the finger.
  it('ignores a chip tap just after "N more"', () => {
    addCategories(6);
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const onChange = jest.fn();
    render(<CategoryChips value="work" onChange={onChange} />);
    fireEvent.press(screen.getByTestId('category-more'));
    fireEvent.press(screen.getByTestId('category-c-0'));
    expect(onChange).not.toHaveBeenCalled();
    now += CATEGORY_CHIPS_SETTLE_MS;
    fireEvent.press(screen.getByTestId('category-c-0'));
    expect(onChange).toHaveBeenCalledWith('c-0');
  });

  // Finding 21: expanded, the list couldn't be folded again.
  it('folds again with "Show fewer"', () => {
    addCategories(6);
    render(<CategoryChips value={null} onChange={jest.fn()} />);
    expect(screen.queryByTestId('category-fewer')).toBeNull();
    fireEvent.press(screen.getByTestId('category-more'));
    expect(screen.getByTestId('category-c-5')).toBeTruthy();
    fireEvent.press(screen.getByTestId('category-fewer'));
    expect(screen.queryByTestId('category-c-5')).toBeNull();
    expect(screen.getByTestId('category-more')).toBeTruthy();
  });

  it('offers no "Show fewer" when everything fits', () => {
    render(<CategoryChips value={null} onChange={jest.fn()} />);
    expect(screen.queryByTestId('category-more')).toBeNull();
    expect(screen.queryByTestId('category-fewer')).toBeNull();
  });
});
