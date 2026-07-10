import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
import { verifyOtp } from '@/features/auth/api';

export function VerifyOtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const onVerify = async () => {
    if (!email || token.trim().length < 6) return;
    setLoading(true);
    try {
      await verifyOtp(email, token);
      // On success Supabase fires an auth state change → the root gate swaps the
      // session and redirects into (app). No manual navigation here.
    } catch (e) {
      Alert.alert('Invalid code', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
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
          onChangeText={setToken}
          editable={!loading}
          returnKeyType="done"
          onSubmitEditing={onVerify}
        />
        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={onVerify}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verify</Text>
          )}
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', gap: 16, padding: 24 },
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
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
