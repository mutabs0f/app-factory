import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { SessionProvider, useSession } from '@/lib/auth';

const queryClient = new QueryClient();

// The auth gate. Declarative Stack.Protected guards mean the guarded group is
// never mounted, so a logged-out user never sees a frame of the (app) screens
// (and vice-versa). Exactly one gate, keyed off the single session source.
function RootNavigator() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </SessionProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
