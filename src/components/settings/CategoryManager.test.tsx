import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { __setIconImageDepsForTests } from '@/media/iconImage';
import { useAuthStore } from '@/store/authStore';
import {
  categoryIcon,
  categoryLabel,
  categoryOptions,
  useCategoryStore,
} from '@/store/categoryStore';

import { CategoryManager } from './CategoryManager';

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  useCategoryStore.setState({ defs: [] });
  await useAuthStore.getState().initialize();
});

afterEach(() => {
  setDbForTests(null);
  __setIconImageDepsForTests(null);
  jest.restoreAllMocks();
});

// Roadmap D39: rename, add and hide, from You.
describe('CategoryManager', () => {
  it('lists the five built-ins, each offered when logging', () => {
    render(<CategoryManager />);
    for (const c of ['work', 'health', 'finance', 'social', 'personal']) {
      expect(screen.getByTestId(`manage-${c}-shown`).props.value).toBe(true);
    }
  });

  it('adds a category, and waits for a name that is free', async () => {
    render(<CategoryManager />);
    expect(screen.getByTestId('manage-add').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.changeText(screen.getByTestId('manage-new-name'), 'health');
    expect(screen.getByText('Another category already has that name.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('manage-new-name'), 'Grad school');
    fireEvent.press(screen.getByTestId('manage-add'));
    await waitFor(() => expect(categoryOptions()).toHaveLength(6));
    expect(categoryLabel(categoryOptions()[5])).toBe('Grad school');
    expect(screen.getByText('Grad school')).toBeTruthy();
  });

  it('renames a built-in in place', async () => {
    render(<CategoryManager />);
    fireEvent.press(screen.getByTestId('manage-finance-rename'));
    fireEvent.changeText(screen.getByTestId('manage-finance-input'), 'Money');
    fireEvent.press(screen.getByTestId('manage-finance-save'));
    await waitFor(() => expect(categoryLabel('finance')).toBe('Money'));
    expect(screen.queryByTestId('manage-finance-input')).toBeNull();
  });

  it('hides one from the choices when logging', async () => {
    render(<CategoryManager />);
    fireEvent(screen.getByTestId('manage-social-shown'), 'valueChange', false);
    await waitFor(() => expect(categoryOptions()).not.toContain('social'));
    expect(screen.getByTestId('manage-social-shown').props.value).toBe(false);
  });

  // Roadmap D40: icons for any category, from the row's icon button.
  it('gives a built-in a suggested emoji, shown in its row', async () => {
    render(<CategoryManager />);
    fireEvent.press(screen.getByTestId('manage-work-icon'));
    expect(screen.getByText('Icon for Work')).toBeTruthy();
    fireEvent.press(screen.getByTestId('icon-emoji-💻'));
    await waitFor(() => expect(categoryIcon('work')).toEqual({ kind: 'emoji', emoji: '💻' }));
    expect(
      screen.getAllByTestId('category-icon-emoji', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId('icon-default'));
    await waitFor(() => expect(categoryIcon('work')).toBeNull());
    fireEvent.press(screen.getByTestId('icon-done'));
    expect(screen.queryByTestId('icon-editor-work')).toBeNull();
  });

  it('takes any one emoji typed in, and says why it waits for one', async () => {
    render(<CategoryManager />);
    fireEvent.press(screen.getByTestId('manage-health-icon'));
    fireEvent.changeText(screen.getByTestId('icon-emoji-input'), 'run');
    expect(screen.getByText('Use just one emoji.')).toBeTruthy();
    expect(screen.getByTestId('icon-emoji-use').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.changeText(screen.getByTestId('icon-emoji-input'), '🚴');
    fireEvent.press(screen.getByTestId('icon-emoji-use'));
    await waitFor(() => expect(categoryIcon('health')).toEqual({ kind: 'emoji', emoji: '🚴' }));
  });

  it('uses a picked picture, and keeps it when a later pick fails', async () => {
    __setIconImageDepsForTests({
      pick: async () => ({ uri: 'file:///photo.jpg', width: 800, height: 600 }),
      squarePng: async () => 'iVBORw0KGgo=',
    });
    render(<CategoryManager />);
    fireEvent.press(screen.getByTestId('manage-finance-icon'));
    fireEvent.press(screen.getByTestId('icon-picture'));
    await waitFor(() =>
      expect(categoryIcon('finance')).toEqual({
        kind: 'image',
        uri: 'data:image/png;base64,iVBORw0KGgo=',
      }),
    );
    expect(
      screen.getAllByTestId('category-icon-image', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);

    jest.spyOn(console, 'warn').mockImplementation(() => {});
    __setIconImageDepsForTests({
      pick: async () => ({ uri: 'file:///broken.heic', width: 10, height: 10 }),
      squarePng: async () => {
        throw new Error('decode failed');
      },
    });
    fireEvent.press(screen.getByTestId('icon-picture'));
    await waitFor(() => expect(screen.getByTestId('icon-error')).toBeTruthy());
    expect(categoryIcon('finance')?.kind).toBe('image');
  });
});
