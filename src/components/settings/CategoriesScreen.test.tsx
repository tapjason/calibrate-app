// The categories sheet (app/categories.tsx). It lives here because a test
// file under app/ would be a route to Expo Router.
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { useCategoryStore } from '@/store/categoryStore';

import CategoriesScreen from '../../../app/categories';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
}));

beforeEach(() => {
  useCategoryStore.setState({ defs: [] });
  mockBack.mockClear();
});

type Instance = ReturnType<typeof screen.getByTestId>;

/** The nearest ancestor that is a host element (a native view), not a component. */
function hostParent(node: Instance): Instance | null {
  let p = node.parent;
  while (p && typeof p.type !== 'string') p = p.parent;
  return p;
}

/** The host elements directly under `node`, in order, skipping components. */
function hostChildren(node: Instance): Instance[] {
  return node.findAll((n: Instance) => n !== node && typeof n.type === 'string', { deep: false });
}

// Compared as a boolean: a failing toBe on two element trees prints both in
// full, and that ran Jest out of memory (PracticeScreen.test.tsx).
const same = (a: Instance | null | undefined, b: Instance | null | undefined) =>
  a != null && a === b;

describe('the categories sheet', () => {
  // The trap in docs/app-profile.md §18: react-native-screens on the New
  // Architecture resizes a formSheet's scroll view to the whole sheet and can
  // lay it at the top, over a header that sits beside it. On the practice
  // sheet (build 1.0.0 (8), owner, 2026-11-21) the content covered the title
  // and the × couldn't be tapped. This sheet had the same shape, its × in a
  // row beside the scroll view; now the × scrolls inside it and the scroll
  // view is the sheet's only child. Don't move the × back out.
  it('keeps the × inside the scroll view, the only thing in the sheet', () => {
    render(<CategoriesScreen />);
    const scroll = screen.getByTestId('categories-scroll');
    expect(same(hostParent(scroll), screen.root)).toBe(true);
    expect(within(scroll).getByTestId('categories-close')).toBeTruthy();
    expect(within(scroll).getByTestId('category-manager')).toBeTruthy();
  });

  it('puts the × row first in the scroll content, above the list', () => {
    render(<CategoriesScreen />);
    const closeRow = hostParent(screen.getByTestId('categories-close'));
    const content = hostParent(screen.getByTestId('category-manager'));
    expect(same(hostParent(closeRow!), content)).toBe(true);
    const rows = hostChildren(content!);
    expect(rows).toHaveLength(2);
    expect(same(rows[0], closeRow)).toBe(true);
    expect(same(rows[1], screen.getByTestId('category-manager'))).toBe(true);
  });

  it('keeps taps on the list while the keyboard is up, and moves clear of it', () => {
    render(<CategoriesScreen />);
    const scroll = screen.getByTestId('categories-scroll');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('closes from the ×', () => {
    render(<CategoriesScreen />);
    fireEvent.press(screen.getByTestId('categories-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
