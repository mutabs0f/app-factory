import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useProfile } from '@/features/profile/hooks';
import { useSession } from '@/lib/auth';

export function HomeScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile } = useProfile(userId);
  const name = profile?.display_name ?? session?.user.email ?? 'there';

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Hi, {name} 👋</ThemedText>
      <ThemedText>You&apos;re signed in.</ThemedText>
      <Link href="/settings" style={styles.link}>
        <ThemedText type="link">Go to settings →</ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  link: { marginTop: 8 },
});
