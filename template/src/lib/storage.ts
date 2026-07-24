import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-get-random-values';

// expo-secure-store is a NATIVE module — it does not exist on web. An app whose
// delivery path is PWA runs this exact class in a browser, where every SecureStore
// call throws and the user can never stay signed in. On web we therefore skip the
// encrypt-to-Keychain layer entirely and let AsyncStorage (localStorage-backed)
// hold the session, which is what supabase-js does by default in a browser.
// The Keychain dance exists only to work around iOS's ~2KB Keychain limit.
const IS_WEB = Platform.OS === 'web';

// LargeSecureStore — the Supabase session store used by every app in the factory.
// expo-secure-store (iOS Keychain) has a ~2KB limit, and Supabase sessions can
// exceed it. So we generate a random AES key per entry, keep the (small) key in
// SecureStore, and keep the (larger) AES-CTR ciphertext in AsyncStorage. The
// session is therefore encrypted at rest and never exceeds the Keychain limit.
// Pattern from the official Supabase + Expo guide. Ships once, reused everywhere.
export class LargeSecureStore {
  private async _encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    try {
      const stored = await AsyncStorage.getItem(key);
      if (!stored) return null;
      if (IS_WEB) return stored;
      return await this._decrypt(key, stored);
    } catch {
      // Corrupted ciphertext or a Keychain/Keystore error → treat as "no value"
      // so Supabase falls back to signed-out and the user simply re-authenticates.
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (IS_WEB) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    if (!IS_WEB) await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  }
}
