import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useProfile } from '@/features/profile/hooks';
import { useSession } from '@/lib/auth';

// REFERENCE SCREEN — every app is cloned from this file, so it must demonstrate the four
// states the frontend-engineer charter requires: loading · error · empty · content.
// It previously destructured only `data`, silently rendering the content branch while a
// fetch was in flight or had failed — the exact defect the charter names, shipped in the
// template that teaches the pattern.
export function HomeScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile, isPending, isError, error, refetch } = useProfile(userId);

  // LOADING
  if (isPending) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator accessibilityLabel="Loading your profile" />
      </ThemedView>
    );
  }

  // ERROR — say what happened in plain words, and always offer the way out.
  if (isError) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Couldn&apos;t load your profile</ThemedText>
        <ThemedText>{error instanceof Error ? error.message : 'Something went wrong.'}</ThemedText>
        <Pressable onPress={() => refetch()} accessibilityRole="button" accessibilityLabel="Try again">
          <ThemedText type="link">Try again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  // EMPTY — a real state, not a fallback string: the row exists but has no name yet.
  const displayName = profile?.display_name?.trim();
  if (!displayName) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Welcome 👋</ThemedText>
        <ThemedText>You haven&apos;t set a name yet.</ThemedText>
        <Link href="/settings" style={styles.link} accessibilityLabel="Add your name in settings">
          <ThemedText type="link">Add your name →</ThemedText>
        </Link>
      </ThemedView>
    );
  }

  // CONTENT
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Hi, {displayName} 👋</ThemedText>
      <ThemedText>You&apos;re signed in.</ThemedText>
      <Link href="/settings" style={styles.link} accessibilityLabel="Go to settings">
        <ThemedText type="link">Go to settings →</ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  link: { marginTop: 8 },
});
