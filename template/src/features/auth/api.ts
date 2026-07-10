import { supabase } from '@/lib/supabase';

// Email OTP (6-digit code). No magic links, no deep-link handling — the most
// error-prone part of mobile auth is simply not present. Works identically in
// Expo Go, dev builds, and sideloaded builds.

export async function sendOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
  if (error) throw error;
}

export async function verifyOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
}
