// The Today screen (app/(tabs)/index.tsx). It lives here because a test file
// under app/ would be a route to Expo Router.
import { act, render, screen } from "@testing-library/react-native";
import { SectionList } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { usePredictionStore } from "@/store/predictionStore";
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
jest.mock("@/components/stats/StreakLine", () => ({
  StreakLine: () => {
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
