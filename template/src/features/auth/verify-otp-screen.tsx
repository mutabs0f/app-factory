import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { sendOtp, verifyOtp } from '@/features/auth/api';

const RESEND_COOLDOWN = 30;

export function VerifyOtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const canVerify = !!email && token.trim().length === 6 && !loading;

  const onVerify = async () => {
    if (!canVerify) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(email, token);
      // Success → Supabase fires an auth state change → the root gate redirects into (app).
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (cooldown > 0 || !email) return;
    setError(null);
    try {
      await sendOtp(email);
      setToken('');
      setCooldown(RESEND_COOLDOWN);
    } catch (e) {
      Alert.alert('Could not resend', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Enter code</ThemedText>
        <ThemedText style={styles.subtitle}>
          We sent a 6-digit code to {email ?? 'your email'}.
        </ThemedText>
        <TextInput
          style={styles.input}
          placeholder="123456"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={6}
          value={token}
          onChangeText={(v) => {
            setToken(v);
            if (error) setError(null);
          }}
          editable={!loading}
          returnKeyType="done"
          onSubmitEditing={onVerify}
          autoFocus
        />
        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        <Pressable
          style={[styles.button, !canVerify && styles.buttonDisabled]}
          onPress={onVerify}
          disabled={!canVerify}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verify</Text>
          )}
        </Pressable>
        <Pressable onPress={onResend} disabled={cooldown > 0} style={styles.linkRow}>
          <ThemedText type="link" style={cooldown > 0 ? styles.linkDisabled : undefined}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </ThemedText>
        </Pressable>
        <Pressable onPress={onBack} style={styles.linkRow}>
          <ThemedText type="link">← Use a different email</ThemedText>
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', gap: 12, padding: 24 },
  subtitle: { opacity: 0.7 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 14,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    color: '#111827',
    backgroundColor: '#fff',
  },
  error: { color: '#dc2626' },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkRow: { alignItems: 'center', paddingVertical: 4 },
  linkDisabled: { opacity: 0.5 },
});
