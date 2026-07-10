import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import type { Database } from '@/types/database.types';
import { LargeSecureStore } from '@/lib/storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.example to .env and fill in your project URL + publishable key.',
  );
}

// The ONLY Supabase client. Import { supabase } from here or from a feature's
// api.ts — never construct another client. The publishable key is safe to ship
// (it is governed by RLS); the secret key must never appear in this repo.
export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // no magic-link URL handling — we use email OTP codes
  },
});

// Refresh tokens only while the app is foregrounded (official pattern). This,
// plus Supabase owning tokens on both ends, retires the malaki "logged out every
// 15 minutes" auth failure class.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
