import { supabase } from '@/lib/supabase';

// Email OTP (6-digit code). No magic links, no deep-link handling — the most
// error-prone part of mobile auth is simply not present. Works identically in
// Expo Go, dev builds, and sideloaded builds.

export async function sendOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
  if (error) throw error;
}

export async function verifyOtp(email: string, token: string): Promise<void> {
  const e = email.trim();
  const t = token.trim();

  const first = await supabase.auth.verifyOtp({ email: e, token: t, type: 'email' });
  if (!first.error) return;

  // A first-time signup (email confirmations on) verifies with type 'signup', not
  // 'email' — and we can't know which client-side. Only retry when the failure is a
  // plausible type mismatch: NEVER on rate-limit (429) or a network/5xx error,
  // where a second call would just burn the limited verification budget (30/5min/IP)
  // and mask the real cause. (Cost: a genuinely-wrong code costs one extra attempt —
  // acceptable vs. breaking sign-in for first-time users.)
  const status = first.error.status ?? 0;
  const worthRetry = status >= 400 && status < 500 && status !== 429;
  if (!worthRetry) throw first.error;

  const second = await supabase.auth.verifyOtp({ email: e, token: t, type: 'signup' });
  if (!second.error) return;
  throw first.error; // surface the user's original attempt, not the fallback's error
}
