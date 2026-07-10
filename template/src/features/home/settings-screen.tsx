import { Pressable, StyleSheet, Text } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/lib/auth';

export function SettingsScreen() {
  const { session, signOut } = useSession();
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Account</ThemedText>
      <ThemedText>{session?.user.email ?? 'unknown'}</ThemedText>
      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, padding: 24 },
  button: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
