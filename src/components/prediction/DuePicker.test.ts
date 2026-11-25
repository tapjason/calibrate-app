import { render } from '@testing-library/react-native';
import { createElement, StrictMode } from 'react';
import { Platform } from 'react-native';

import { clampPicked, DuePicker, localNoonIso, openWebPicker } from './DuePicker';

describe('localNoonIso', () => {
  // Anchored at local noon, like the presets, so the UTC timestamp falls on
  // the same calendar day in every zone from UTC-12 to UTC+12.
  it('lands on local noon of the chosen day', () => {
    const d = new Date(localNoonIso(2026, 9, 3));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([
      2026, 9, 3, 12,
    ]);
  });
});

// A typed date gets past a web date field's min and max (blind playtests
// 2026-11-04 and 2026-11-08, which typed 1906 and 9999).
describe('clampPicked', () => {
  const earliest = new Date(2026, 10, 9);
  const latest = new Date(2028, 10, 8);

  it('keeps a day inside the range', () => {
    const day = new Date(2027, 0, 5);
    expect(clampPicked(day, earliest, latest)).toBe(day);
  });

  it('moves an early day to the earliest and a late one to the latest', () => {
    expect(clampPicked(new Date(1906, 10, 5), earliest, latest)).toBe(earliest);
    expect(clampPicked(new Date(9999, 11, 31), earliest, latest)).toBe(latest);
  });
});

// The owner, 2026-11-24: "Pick a date" opens the full calendar at once. On
// web the browser's own calendar opens where it can.
describe('openWebPicker', () => {
  it("opens the field's calendar where the browser can", () => {
    const showPicker = jest.fn();
    openWebPicker({ showPicker });
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('leaves the field alone where it can\'t, or refuses', () => {
    expect(() => openWebPicker(null)).not.toThrow();
    expect(() => openWebPicker({})).not.toThrow();
    const refused = jest.fn(() => {
      throw new Error('NotAllowedError');
    });
    expect(() => openWebPicker({ showPicker: refused })).not.toThrow();
  });
});

describe('DuePicker on web', () => {
  const realOS = Platform.OS;
  afterEach(() => {
    Platform.OS = realOS;
  });

  /** A tap's open request, as DueDateChips holds it: true once, then false. */
  const oneRequest = (asked: boolean) => {
    let pending = asked;
    return () => {
      const was = pending;
      pending = false;
      return was;
    };
  };
  const props = (takeOpenRequest: () => boolean) => ({
    value: localNoonIso(2026, 11, 2),
    onChange: jest.fn(),
    earliest: new Date(2026, 10, 25),
    latest: new Date(2028, 10, 24),
    takeOpenRequest,
  });

  it('opens the calendar once when a tap brought it in, never on a re-render', () => {
    Platform.OS = 'web';
    const showPicker = jest.fn();
    const createNodeMock = (el: { type: unknown }) => (el.type === 'input' ? { showPicker } : null);
    const take = oneRequest(true);
    const view = render(createElement(DuePicker, props(take)), { createNodeMock });
    expect(showPicker).toHaveBeenCalledTimes(1);
    view.rerender(createElement(DuePicker, { ...props(take), value: localNoonIso(2026, 11, 3) }));
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  // Web playtest 2026-11-24: one tap in Edit opened it twice, the effect run
  // a second time. The request is taken, so a second run finds none.
  it('opens it once when its effect runs twice', () => {
    Platform.OS = 'web';
    const showPicker = jest.fn();
    const createNodeMock = (el: { type: unknown }) => (el.type === 'input' ? { showPicker } : null);
    render(createElement(StrictMode, null, createElement(DuePicker, props(oneRequest(true)))), {
      createNodeMock,
    });
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('stays closed when it shows for a date already picked', () => {
    Platform.OS = 'web';
    const showPicker = jest.fn();
    const createNodeMock = (el: { type: unknown }) => (el.type === 'input' ? { showPicker } : null);
    render(createElement(DuePicker, props(oneRequest(false))), { createNodeMock });
    expect(showPicker).not.toHaveBeenCalled();
  });
});
