// The client's session storage choice (security review round 5): the Keychain
// on iOS, AsyncStorage on web and on a build without expo-secure-store, and
// the storage key the client and the storage's launch check share.

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { loadKeychain } from './client';
import { supabaseStorageKey } from './sessionStorage';

describe('loadKeychain', () => {
  it('gives the Keychain on iOS, every item written AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY', () => {
    expect(Platform.OS).toBe('ios');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    const keychain = loadKeychain();
    expect(keychain).not.toBeNull();
    expect(keychain?.accessible).toBe(SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);
    expect(typeof keychain?.store.getItemAsync).toBe('function');
    expect(typeof keychain?.store.setItemAsync).toBe('function');
    expect(typeof keychain?.store.deleteItemAsync).toBe('function');
  });

  it.each(['web', 'android'] as const)('keeps AsyncStorage on %s', (os) => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    try {
      expect(loadKeychain()).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });

  it('keeps AsyncStorage on a build made before the module was added (its require throws)', () => {
    jest.isolateModules(() => {
      jest.doMock('expo-secure-store', () => {
        throw new Error("Cannot find native module 'ExpoSecureStore'");
      });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const isolated = require('./client') as typeof import('./client');
      expect(isolated.loadKeychain()).toBeNull();
    });
  });

  it('keeps AsyncStorage when the accessibility constant is missing, rather than write a backed-up item', () => {
    jest.isolateModules(() => {
      jest.doMock('expo-secure-store', () => ({
        getItemAsync: jest.fn(),
        setItemAsync: jest.fn(),
        deleteItemAsync: jest.fn(),
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const isolated = require('./client') as typeof import('./client');
      expect(isolated.loadKeychain()).toBeNull();
    });
  });
});

describe('supabaseStorageKey', () => {
  it.each([
    'https://abcdefghijklmnop.supabase.co',
    'https://abcdefghijklmnop.supabase.co/',
    '  https://abcdefghijklmnop.supabase.co  ',
    'http://127.0.0.1:54321',
    'https://api.example.com/base',
  ])("is the key supabase-js picks itself for %j", (url) => {
    const client = createClient(url, 'anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const own = (client.auth as unknown as { storageKey: string }).storageKey;
    expect(supabaseStorageKey(url)).toBe(own);
  });

  it('is a key SecureStore accepts for a Supabase project address', () => {
    expect(supabaseStorageKey('https://abcdefghijklmnop.supabase.co')).toBe(
      'sb-abcdefghijklmnop-auth-token',
    );
    expect(supabaseStorageKey('https://abcdefghijklmnop.supabase.co')).toMatch(/^[\w.-]+$/);
  });
});
