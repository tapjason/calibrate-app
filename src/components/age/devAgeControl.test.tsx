// The development-only control on /dev/seed (app/dev/seed.tsx) that gives
// the age store an under-13 band and takes it away, so the local-only
// screens (roadmap D70) can be seen on the web build, where Apple's age sheet
// doesn't exist. Tested from here: a test file under app/ would be a route.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { getAgeBucket } from '@/db/ageBucket';
import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';

import DevSeedScreen from '../../../app/dev/seed';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

beforeEach(async () => {
  setDbForTests(await createTestDb());
  mockRedirect.mockClear();
});

afterEach(() => {
  act(() => __resetAgeStoreForTests());
  setDbForTests(null);
});

describe('/dev/seed: the under-13 control', () => {
  it('turns the rule on through the age store, saved like Apple’s answer, and off again', async () => {
    render(<DevSeedScreen />);
    const control = () => screen.getByTestId('dev-seed-under13');
    expect(control()).toHaveTextContent('Set an under-13 age range (local-only)');

    fireEvent.press(control());
    await waitFor(() => expect(useAgeStore.getState().localOnly).toBe(true));
    expect(useAgeStore.getState().bucket).toEqual({ lowerBound: null, upperBound: 12 });
    expect(await getAgeBucket()).toEqual({ lowerBound: null, upperBound: 12 });
    expect(await screen.findByText('This device is local-only (an under-13 age range).')).toBeTruthy();
    expect(control()).toHaveTextContent('Clear the under-13 age range (saves 18+)');

    await waitFor(() => expect(control()).toBeEnabled());
    fireEvent.press(control());
    await waitFor(() => expect(useAgeStore.getState().localOnly).toBe(false));
    expect(await getAgeBucket()).toEqual({ lowerBound: 18, upperBound: null });
    expect(await screen.findByText('The under-13 rule is off (an 18+ age range is saved).')).toBeTruthy();
  });

  // The route's own guard: a release build redirects home and draws nothing.
  it('is never drawn outside a development build', () => {
    const g = globalThis as unknown as { __DEV__: boolean };
    const before = g.__DEV__;
    g.__DEV__ = false;
    try {
      render(<DevSeedScreen />);
      expect(mockRedirect).toHaveBeenCalledWith('/');
      expect(screen.queryByTestId('dev-seed-under13')).toBeNull();
    } finally {
      g.__DEV__ = before;
    }
  });
});
