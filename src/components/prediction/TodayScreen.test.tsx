// The Today screen (app/(tabs)/index.tsx). It lives here because a test file
// under app/ would be a route to Expo Router.
import { act, render, screen } from "@testing-library/react-native";
import { SectionList, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import type { CheckpointMoment } from "@/components/stats/checkpointMoment";
import { localDayKey } from "@/components/ui/useLocalDay";
import { usePredictionStore } from "@/store/predictionStore";
import { __setPersistenceForTests, useSettingsStore } from "@/store/settingsStore";
import type { Prediction } from "@/types";

import TodayScreen from "../../../app/(tabs)/index";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  // Runs as an effect: the screen is always focused here.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(cb, [cb]);
  },
}));
jest.mock("@react-navigation/native", () => ({ useScrollToTop: jest.fn() }));
// Reduce Motion is a system setting; mock only that hook (as MilestoneCard's
// test does: the default export has to be carried over by hand).
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  };
});
jest.mock("@/store/ratingStore", () => ({
  useRatingStore: { getState: () => ({ askIfDue: jest.fn() }) },
}));
// The daily rows stand in as one marker each: this is about their place.
jest.mock("@/components/practice/PracticeCard", () => ({
  PracticeCard: () => {
    const { Text: T } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <T>daily-practice</T>;
  },
}));
// It records the moment it's handed (step 194).
const mockStreakLine = jest.fn();
jest.mock("@/components/stats/StreakLine", () => ({
  StreakLine: (props: { moment?: unknown }) => {
    mockStreakLine(props);
    const { Text: T } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <T>daily-streak</T>;
  },
}));
jest.mock("@/components/prediction/ReminderPrompt", () => ({
  ReminderPrompt: () => {
    const { Text: T } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <T>reminder-ask</T>;
  },
}));
jest.mock("@/components/settings/BackupNudge", () => ({
  BackupNudge: () => null,
}));
jest.mock("@/components/prediction/WelcomeBackCard", () => ({
  WelcomeBackCard: () => null,
}));

const DAY_MS = 24 * 60 * 60 * 1000;

function open(
  id: string,
  dueInDays: number,
  createdMsAgo = 3 * DAY_MS,
): Prediction {
  const now = Date.now();
  return {
    id,
    user_id: "u1",
    title: `Prediction ${id}`,
    category: "work",
    confidence: 70,
    created_at: new Date(now - createdMsAgo).toISOString(),
    due_date: new Date(now + dueInDays * DAY_MS).toISOString(),
    status: "pending",
    resolved_at: null,
    reflection: null,
    integrity_bonus: false,
  };
}

type Node = { children?: (Node | string)[] | null } | string | null;

/** Where each text first appears in the rendered tree, in reading order. */
function order(...texts: string[]): number[] {
  const seen: string[] = [];
  const walk = (n: Node | Node[]): void => {
    if (n === null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === "string") {
      seen.push(n);
      return;
    }
    (n.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as Node | Node[]);
  const all = seen.join(" | ");
  return texts.map((t) => all.indexOf(t));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useReducedMotion).mockReturnValue(false);
  usePredictionStore.setState({ pending: [], resolved: [], justSavedId: null });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Today, the order (roadmap D22, D48)", () => {
  it("puts the open predictions above the streak and practice rows when nothing is ready", () => {
    usePredictionStore.setState({ pending: [open("a", 3), open("b", 10)] });
    render(<TodayScreen />);
    const [a, b, streak, practice] = order(
      "Prediction a",
      "Prediction b",
      "daily-streak",
      "daily-practice",
    );
    expect(a).toBeGreaterThan(-1);
    expect(streak).toBeGreaterThan(Math.max(a, b));
    expect(practice).toBeGreaterThan(Math.max(a, b));
    expect(screen.getByTestId("home-daily-after-open")).toBeTruthy();
  });

  it("keeps the daily rows right after what is ready, above the rest", () => {
    usePredictionStore.setState({
      pending: [open("due", -1), open("later", 10)],
    });
    render(<TodayScreen />);
    const [due, streak, later] = order(
      "Prediction due",
      "daily-streak",
      "Prediction later",
    );
    expect(streak).toBeGreaterThan(due);
    expect(later).toBeGreaterThan(streak);
    expect(screen.queryByTestId("home-daily-after-open")).toBeNull();
  });

  // Owner, 2026-11-10: the notification ask stays beside what it's about.
  it("keeps the reminder ask under the score, above the cards, either way", () => {
    usePredictionStore.setState({ pending: [open("a", 3)] });
    const first = render(<TodayScreen />);
    let [ask, a] = order("reminder-ask", "Prediction a");
    expect(ask).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(a);
    first.unmount();
    usePredictionStore.setState({ pending: [open("due", -1)] });
    render(<TodayScreen />);
    [ask, a] = order("reminder-ask", "Prediction due");
    expect(ask).toBeLessThan(a);
  });

  it("puts the daily rows under the empty state when nothing is open", () => {
    usePredictionStore.setState({ pending: [], resolved: [open("done", -3)] });
    render(<TodayScreen />);
    const [empty, streak] = order("Nothing open.", "daily-streak");
    expect(empty).toBeGreaterThan(-1);
    expect(streak).toBeGreaterThan(empty);
  });
});

describe("Today after a save (roadmap D48)", () => {
  const list = () => screen.UNSAFE_getByType(SectionList);
  const spy = () =>
    jest
      .spyOn(SectionList.prototype, "scrollToLocation")
      .mockImplementation(() => {});

  it("scrolls the card just saved to just below the top, once", () => {
    const scroll = spy();
    usePredictionStore.setState({
      pending: [open("a", 3), open("b", 10), open("new", 20, 1_000)],
      justSavedId: "new",
    });
    render(<TodayScreen />);
    act(() => jest.advanceTimersByTime(700));
    expect(scroll).toHaveBeenCalledTimes(1);
    // "Next 7 days" holds a; "Later" holds b, then the new one.
    // Below the view, so just inside the bottom edge (owner, 2026-11-10).
    expect(scroll).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionIndex: 1,
        itemIndex: 2,
        viewPosition: 1,
        viewOffset: -16,
        animated: true,
      }),
    );
    expect(usePredictionStore.getState().justSavedId).toBeNull();
    // Another change to the list doesn't take you back to it.
    act(() =>
      usePredictionStore.setState({
        pending: [...usePredictionStore.getState().pending, open("c", 4)],
      }),
    );
    act(() => jest.advanceTimersByTime(700));
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("stays put for a card this Log didn’t save, such as one a sync pull brought", () => {
    const scroll = spy();
    usePredictionStore.setState({
      pending: [open("a", 3), open("synced", 20, 1_000)],
    });
    render(<TodayScreen />);
    act(() => jest.advanceTimersByTime(700));
    expect(scroll).not.toHaveBeenCalled();
  });

  // Owner, 2026-11-10: on Day 0 a scroll pushed the first answer's day off.
  it("stays put when the whole card is already on screen", () => {
    const scroll = spy();
    usePredictionStore.setState({
      pending: [open("first", 1, 1_000)],
      justSavedId: "first",
    });
    render(<TodayScreen />);
    act(() =>
      list().props.onViewableItemsChanged({
        viewableItems: [{ key: "first" }],
        changed: [],
      }),
    );
    act(() => jest.advanceTimersByTime(700));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("jumps without a slide under Reduce Motion", () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const scroll = spy();
    usePredictionStore.setState({
      pending: [open("a", 3), open("new", 20, 1_000)],
      justSavedId: "new",
    });
    render(<TodayScreen />);
    act(() => jest.advanceTimersByTime(700));
    expect(scroll).toHaveBeenCalledWith(
      expect.objectContaining({ animated: false }),
    );
  });

  it("brings a card above the view just below the top", () => {
    const scroll = spy();
    usePredictionStore.setState({
      pending: [open("soon", 2, 1_000), open("b", 10), open("c", 20)],
      justSavedId: "soon",
    });
    render(<TodayScreen />);
    // Scrolled down to the later ones before logging.
    act(() =>
      list().props.onViewableItemsChanged({
        viewableItems: [{ key: "b" }, { key: "c" }],
        changed: [],
      }),
    );
    act(() => jest.advanceTimersByTime(700));
    expect(scroll).toHaveBeenCalledWith(
      expect.objectContaining({ viewPosition: 0, viewOffset: 16 }),
    );
  });

  it("tries once more when the card isn’t rendered yet, then gives up", () => {
    const failed = {
      index: 4,
      averageItemLength: 80,
      highestMeasuredFrameIndex: 1,
    };
    // As VirtualizedList does: the failure is reported during the call.
    const scroll = jest
      .spyOn(SectionList.prototype, "scrollToLocation")
      .mockImplementation(function (this: SectionList<Prediction>) {
        this.props.onScrollToIndexFailed?.(failed);
      });
    usePredictionStore.setState({
      pending: [open("a", 3), open("new", 20, 1_000)],
      justSavedId: "new",
    });
    render(<TodayScreen />);
    // The decision after 120 ms of quiet, the retry 150 ms after it fails.
    act(() => jest.advanceTimersByTime(130));
    expect(scroll).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(200));
    expect(scroll).toHaveBeenCalledTimes(2);
    act(() => jest.advanceTimersByTime(700));
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it("arms no retry after a scroll that worked", () => {
    const scroll = spy();
    usePredictionStore.setState({
      pending: [open("a", 3), open("new", 20, 1_000)],
      justSavedId: "new",
    });
    render(<TodayScreen />);
    act(() => jest.advanceTimersByTime(700));
    act(() =>
      list().props.onScrollToIndexFailed({
        index: 4,
        averageItemLength: 80,
        highestMeasuredFrameIndex: 1,
      }),
    );
    act(() => jest.advanceTimersByTime(700));
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("doesn’t scroll after leaving before the sheet has gone", () => {
    const scroll = spy();
    usePredictionStore.setState({
      pending: [open("a", 3), open("new", 20, 1_000)],
      justSavedId: "new",
    });
    const view = render(<TodayScreen />);
    view.unmount();
    act(() => jest.advanceTimersByTime(700));
    expect(scroll).not.toHaveBeenCalled();
  });
});

// Step 194 (D67; FUTURE_UI B1): a log can reach a streak checkpoint as well
// as an answer, and Log closes onto Today, so the streak row plays the moment.
describe("Today after a log reached a streak checkpoint (step 194)", () => {
  const list = () => screen.UNSAFE_getByType(SectionList);
  const toCard = () =>
    jest.spyOn(SectionList.prototype, "scrollToLocation").mockImplementation(() => {});
  const moment = (): CheckpointMoment | null =>
    (mockStreakLine.mock.calls.at(-1)?.[0] as { moment?: CheckpointMoment | null })?.moment ??
    null;
  // React Native's Jest View shares one jest.fn for measureInWindow, so
  // spyOn hands that back and restoreAllMocks leaves its implementation:
  // reset after each test.
  const viewMethods = (View as unknown as { prototype: { measureInWindow: jest.Mock } })
    .prototype;
  /** Where the row and the screen sit in the window, as measureInWindow reports them. */
  const measured = (row: [number, number], screenBox: [number, number]) =>
    viewMethods.measureInWindow.mockImplementation(function (
      this: { props: { testID?: string } },
      cb: (x: number, y: number, w: number, h: number) => void,
    ) {
      if (this.props.testID === "home-streak-box") cb(0, row[0], 320, row[1]);
      if (this.props.testID === "home-screen") cb(0, screenBox[0], 320, screenBox[1]);
    });
  const scrollResponder = () => {
    const scrollTo = jest.fn();
    jest
      .spyOn(SectionList.prototype, "getScrollResponder")
      .mockReturnValue({ scrollTo } as never);
    return scrollTo;
  };
  const loggedDaySeven = (extra: Partial<ReturnType<typeof usePredictionStore.getState>> = {}) =>
    usePredictionStore.setState({
      pending: [open("a", 3), open("new", 20, 1_000)],
      justSavedId: "new",
      streakCheckpoint: 7,
      streakCheckpointFrom: "log",
      ...extra,
    });

  beforeEach(() => {
    mockStreakLine.mockClear();
    // The day the moment last played: in memory.
    let stored: object | null = null;
    __setPersistenceForTests({
      load: async () => stored,
      save: async (s) => {
        stored = s;
      },
    });
  });
  afterEach(() => {
    __setPersistenceForTests(null);
    viewMethods.measureInWindow.mockReset();
  });

  it("plays on the streak row, held out of sight until then, instead of a scroll to the card", () => {
    const scroll = toCard();
    loggedDaySeven();
    render(<TodayScreen />);
    expect(moment()).toEqual({ days: 7, play: false });
    // Taken: neither Today later nor Resolve shows it again.
    expect(usePredictionStore.getState()).toMatchObject({
      streakCheckpoint: null,
      streakCheckpointFrom: null,
      justSavedId: null,
    });
    expect(useSettingsStore.getState().streakMomentDay).toBe(localDayKey(new Date()));

    // Once the list has settled, and the row's place couldn't be measured:
    // it plays where it is.
    act(() => jest.advanceTimersByTime(120 + 300));
    expect(moment()).toEqual({ days: 7, play: true });
    expect(scroll).not.toHaveBeenCalled();
    // Still again once it has played.
    act(() => jest.advanceTimersByTime(1800));
    expect(moment()).toBeNull();
  });

  it("brings the row into view first, only as far as needed, then plays", () => {
    const scroll = toCard();
    const scrollTo = scrollResponder();
    // The screen is 500 tall from y 100; the row's 90 sit at 900, below it.
    measured([900, 90], [100, 500]);
    loggedDaySeven();
    render(<TodayScreen />);
    act(() =>
      list().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 50 } } }),
    );
    act(() => jest.advanceTimersByTime(120));
    // Its bottom (800 + 90 into the screen) to 16 above the screen's bottom.
    expect(scrollTo).toHaveBeenCalledWith({ y: 50 + (890 - 484), animated: true });
    expect(scroll).not.toHaveBeenCalled();
    expect(moment()).toEqual({ days: 7, play: false });
    act(() => jest.advanceTimersByTime(400));
    expect(moment()).toEqual({ days: 7, play: true });
  });

  it("stays put when the row is already all in view, and plays at once", () => {
    const scrollTo = scrollResponder();
    measured([300, 90], [100, 500]);
    loggedDaySeven();
    render(<TodayScreen />);
    act(() => jest.advanceTimersByTime(120));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(0));
    expect(moment()).toEqual({ days: 7, play: true });
  });

  it("jumps without a slide under Reduce Motion, and plays at once", () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const scrollTo = scrollResponder();
    measured([900, 90], [100, 500]);
    loggedDaySeven();
    render(<TodayScreen />);
    act(() => jest.advanceTimersByTime(120));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ animated: false }));
    expect(moment()).toEqual({ days: 7, play: true });
  });

  it("plays when Today is next shown, after a log made over another tab", () => {
    // That tab took the new card's mark (D48); the checkpoint waited.
    loggedDaySeven({ justSavedId: null });
    render(<TodayScreen />);
    expect(moment()).toEqual({ days: 7, play: false });
    act(() => jest.advanceTimersByTime(420));
    expect(moment()).toEqual({ days: 7, play: true });
  });

  it("plays nothing while the streak is hidden in You, and scrolls to the card as before", () => {
    useSettingsStore.setState({ streakShown: false });
    const scroll = toCard();
    loggedDaySeven();
    render(<TodayScreen />);
    act(() => jest.advanceTimersByTime(700));
    expect(moment()).toBeNull();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(usePredictionStore.getState().streakCheckpoint).toBeNull();
    expect(useSettingsStore.getState().streakMomentDay).toBeNull();
  });

  it("plays once a day: after it has played today, Today scrolls to the card as before", () => {
    useSettingsStore.setState({ streakMomentDay: localDayKey(new Date()) });
    const scroll = toCard();
    loggedDaySeven();
    render(<TodayScreen />);
    act(() => jest.advanceTimersByTime(700));
    expect(moment()).toBeNull();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("leaves an answer's checkpoint for Resolve", () => {
    loggedDaySeven({ streakCheckpointFrom: "answer", justSavedId: null });
    render(<TodayScreen />);
    act(() => jest.advanceTimersByTime(700));
    expect(moment()).toBeNull();
    expect(usePredictionStore.getState().streakCheckpoint).toBe(7);
  });

  it("stops if Today is left before it plays", () => {
    loggedDaySeven();
    const view = render(<TodayScreen />);
    view.unmount();
    mockStreakLine.mockClear();
    act(() => jest.advanceTimersByTime(3000));
    expect(mockStreakLine).not.toHaveBeenCalled();
  });
});
