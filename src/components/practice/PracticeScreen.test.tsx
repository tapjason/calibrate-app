// The practice sheet (app/practice.tsx). It lives here because a test file
// under app/ would be a route to Expo Router.
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { space } from '@/constants/theme';
import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { usePracticeStore } from '@/store/practiceStore';
import type { PracticeFacts } from '@/types';

import PracticeScreen from '../../../app/practice';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/analytics/track', () => ({ track: jest.fn(async () => {}) }));
// The offer has its own tests; only the sheet around it is under test.
jest.mock('@/components/practice/PracticeReminderOffer', () => ({ PracticeReminderOffer: () => null }));
// Reduce Motion is a system setting; mock only that hook. The default export
// (Animated) has to be carried over by hand, since spreading a module object
// drops it.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  };
});

const FACTS: PracticeFacts = {
  places: [
    { name: 'Rome', lat: 41.9, lon: 12.5 },
    { name: 'Madrid', lat: 40.42, lon: -3.7 },
  ],
  countries: [
    { name: 'Spain', value: 505_990 },
    { name: 'Germany', value: 357_114 },
  ],
  mountains: [],
  bodies: [],
  events: [],
  people: [
    { name: 'Charles Darwin', born: 1809 },
    { name: 'Marie Curie', born: 1867 },
  ],
  elements: [],
};

beforeEach(async () => {
  setDbForTests(await createTestDb());
  usePracticeStore.setState({ facts: FACTS, answers: [], hydrated: true });
  jest.mocked(useReducedMotion).mockReturnValue(false);
  mockBack.mockClear();
});

afterEach(() => {
  setDbForTests(null);
});

type Instance = ReturnType<typeof screen.getByTestId>;

/** The nearest ancestor that is a host element (a native view), not a component. */
function hostParent(node: Instance): Instance | null {
  let p = node.parent;
  while (p && typeof p.type !== 'string') p = p.parent;
  return p;
}

// Compared as a boolean: a failing toBe on two element trees prints both in
// full, and that ran Jest out of memory.
const same = (a: Instance | null, b: Instance | null) => a !== null && a === b;

async function answerAll() {
  const day = usePracticeStore.getState().today();
  const qs = usePracticeStore.getState().questionsFor(day);
  for (const [slot, q] of qs.entries()) {
    await usePracticeStore.getState().answer(day, slot, q.correctIndex, 80);
  }
}

describe('the practice sheet', () => {
  // The trap in docs/app-profile.md §18: react-native-screens on the New
  // Architecture resizes a formSheet's scroll view to the whole sheet and can
  // lay it at the top, over a header that sits beside it. On build 1.0.0 (8)
  // the progress bar covered the title and the × couldn't be tapped (owner,
  // 2026-11-21). The title and × scroll inside the scroll view, as on Share,
  // and the scroll view is the sheet's only child. Don't move them back out.
  it('keeps the title and the × inside the scroll view, the only thing in the sheet', () => {
    render(<PracticeScreen />);
    const scroll = screen.getByTestId('practice-scroll');
    expect(same(hostParent(scroll), screen.root)).toBe(true);
    expect(within(scroll).getByRole('header', { name: 'Today’s practice' })).toBeTruthy();
    expect(within(scroll).getByTestId('practice-close')).toBeTruthy();
    expect(within(scroll).getByTestId('practice-quiz')).toBeTruthy();
  });

  it('does the same on the answers', async () => {
    await answerAll();
    render(<PracticeScreen />);
    const scroll = screen.getByTestId('practice-scroll');
    expect(same(hostParent(scroll), screen.root)).toBe(true);
    expect(within(scroll).getByRole('header', { name: 'Today’s practice' })).toBeTruthy();
    expect(within(scroll).getByTestId('practice-close')).toBeTruthy();
    expect(within(scroll).getByTestId('practice-result')).toBeTruthy();
  });

  it('closes from the ×', () => {
    render(<PracticeScreen />);
    fireEvent.press(screen.getByTestId('practice-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // Next's offset reaches the screen in the scroll content's coordinates only
  // while the quiz sits in the content beside the header row: its y there
  // counts the header and the gap above it (playtest 2026-11-09b, finding 16).
  describe('bringing Next into view', () => {
    const HEADER = 44;
    const QUIZ_Y = space.lg + HEADER + space.lg;
    const layOut = (viewport: number) => {
      const scroll = screen.UNSAFE_getByType(ScrollView);
      fireEvent(scroll, 'layout', { nativeEvent: { layout: { height: viewport } } });
      fireEvent(screen.getByTestId('practice-quiz'), 'layout', {
        nativeEvent: { layout: { x: 0, y: QUIZ_Y, width: 320, height: 600 } },
      });
      fireEvent(screen.getByTestId('practice-next-box'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 540, width: 320, height: 50 } },
      });
      const scrollTo = jest.fn();
      scroll.instance.scrollTo = scrollTo;
      return scrollTo;
    };

    it('puts the quiz in the same container as the header row', () => {
      render(<PracticeScreen />);
      const header = hostParent(screen.getByTestId('practice-close'))!;
      expect(same(hostParent(screen.getByTestId('practice-quiz')), hostParent(header))).toBe(true);
    });

    it('scrolls just far enough, counting the header above the quiz', () => {
      render(<PracticeScreen />);
      const scrollTo = layOut(500);
      fireEvent.press(screen.getByTestId('practice-option-0'));
      // Next's bottom is at QUIZ_Y + 540 + 50; a 500-high view shows 0–500.
      expect(scrollTo).toHaveBeenCalledWith({ y: QUIZ_Y + 540 + 50 + space.lg - 500, animated: true });
    });

    it('jumps without motion under Reduce Motion', () => {
      jest.mocked(useReducedMotion).mockReturnValue(true);
      render(<PracticeScreen />);
      const scrollTo = layOut(500);
      fireEvent.press(screen.getByTestId('practice-option-0'));
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ animated: false }));
    });

    it('leaves the scroll alone when Next is already in sight', () => {
      render(<PracticeScreen />);
      const scrollTo = layOut(900);
      fireEvent.press(screen.getByTestId('practice-option-0'));
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});
