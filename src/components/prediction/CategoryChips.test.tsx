import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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

// Blind playtest 2026-11-13c, finding 10: football, family and the flower
// market went under Work or Personal; adding one meant leaving Log.
describe('CategoryChips — a new category from here', () => {
  it('adds one and chooses it', async () => {
    const add = jest.fn(async () => 'c-new' as Category);
    useCategoryStore.setState({ add });
    const onChange = jest.fn();
    render(<CategoryChips value={null} onChange={onChange} canAdd />);

    fireEvent.press(screen.getByTestId('category-add'));
    expect(screen.queryByTestId('category-add')).toBeNull();
    fireEvent.changeText(screen.getByTestId('category-add-field'), 'Football ⚽');
    fireEvent.press(screen.getByTestId('category-add-save'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('c-new'));
    expect(add).toHaveBeenCalledWith('Football ⚽');
    expect(screen.queryByTestId('category-add-box')).toBeNull();
  });

  it("says what's wrong with a name and chooses nothing", async () => {
    useCategoryStore.setState({
      add: jest.fn(async () => {
        throw new Error('Another category already has that name.');
      }),
    });
    const onChange = jest.fn();
    render(<CategoryChips value={null} onChange={onChange} canAdd />);

    fireEvent.press(screen.getByTestId('category-add'));
    fireEvent.changeText(screen.getByTestId('category-add-field'), 'Work');
    fireEvent.press(screen.getByTestId('category-add-save'));

    await waitFor(() =>
      expect(screen.getByTestId('category-add-problem')).toHaveTextContent(
        'Another category already has that name.',
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('category-add-cancel'));
    expect(screen.queryByTestId('category-add-box')).toBeNull();
  });

  it('is offered only where asked for', () => {
    render(<CategoryChips value={null} onChange={jest.fn()} />);
    expect(screen.queryByTestId('category-add')).toBeNull();
  });
});

describe('CategoryChips — a name hidden from these choices', () => {
  // Code review, step 177: "Another category already has that name" for one
  // the person can't see here was a dead end.
  it('shows the hidden one again and chooses it', async () => {
    const setHidden = jest.fn(async () => {});
    const add = jest.fn(async () => 'c-new' as Category);
    useCategoryStore.setState({
      defs: [
        {
          id: 'c-foot' as Category,
          user_id: 'u1',
          name: 'Football',
          icon: null,
          hidden: true,
          position: 1,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ],
      setHidden,
      add,
    });
    const onChange = jest.fn();
    render(<CategoryChips value={null} onChange={onChange} canAdd />);
    fireEvent.press(screen.getByTestId('category-add'));
    fireEvent.changeText(screen.getByTestId('category-add-field'), 'football');
    fireEvent.press(screen.getByTestId('category-add-save'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('c-foot'));
    expect(setHidden).toHaveBeenCalledWith('c-foot', false);
    expect(add).not.toHaveBeenCalled();
  });

  it('adds once on a double tap', async () => {
    let finish: (id: Category) => void = () => {};
    const add = jest.fn(() => new Promise<Category>((resolve) => (finish = resolve)));
    useCategoryStore.setState({ defs: [], add });
    render(<CategoryChips value={null} onChange={jest.fn()} canAdd />);
    fireEvent.press(screen.getByTestId('category-add'));
    fireEvent.changeText(screen.getByTestId('category-add-field'), 'Family');
    fireEvent.press(screen.getByTestId('category-add-save'));
    fireEvent.press(screen.getByTestId('category-add-save'));
    await waitFor(() => expect(add).toHaveBeenCalled());
    finish('c-fam' as Category);
    // Slow under the full suite's load, as the drop-line test (step 176).
    await waitFor(() => expect(screen.queryByTestId('category-add-box')).toBeNull(), {
      timeout: 5000,
    });
    expect(add).toHaveBeenCalledTimes(1);
  });
});
