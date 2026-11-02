import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';
import { categoryLabel, categoryOptions, useCategoryStore } from '@/store/categoryStore';

import { CategoryManager } from './CategoryManager';

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useAuthStore.getState().reset();
  useCategoryStore.setState({ defs: [] });
  await useAuthStore.getState().initialize();
});

afterEach(() => {
  setDbForTests(null);
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
    expect(screen.getByTestId('manage-add').props.accessibilityState).toMatchObject({ disabled: true });
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
});
