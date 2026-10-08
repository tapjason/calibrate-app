import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

export type AppearanceName = 'light' | 'dark';

function subscribe(onChange: () => void): () => void {
  const sub = Appearance.addChangeListener(onChange);
  return () => sub.remove();
}

/** The phone's appearance now. Anything but dark is light, as the tokens are. */
export function currentAppearance(): AppearanceName {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

/**
 * The phone's light or dark appearance (roadmap D7), for the few things that
 * take a plain value rather than a dynamic token: React Navigation's theme.
 *
 * Not react-native's `useColorScheme`: react-native-web's version subscribes
 * again on every render, and a re-render while the browser is still handing
 * out the change event removes its listener before the event reaches it. The
 * first switch after a load was lost, so the header and the tab bar kept the
 * old appearance under content that had changed (roadmap step 91). One
 * subscription for the life of the component, and a snapshot read fresh on
 * every render, can't miss it. On iOS this is what `useColorScheme` does too.
 */
export function useAppearance(): AppearanceName {
  return useSyncExternalStore(subscribe, currentAppearance, currentAppearance);
}
