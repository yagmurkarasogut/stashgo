import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { LogBox, View, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { ToastProvider } from '@/src/context/ToastContext';
import { I18nProvider, useI18n } from '@/src/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Purchases from 'react-native-purchases';
import { initializeRevenueCat, SubscriptionProvider, rcEnabled } from '@/src/lib/revenuecat';
import { colors } from '@/src/theme';

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

try {
  initializeRevenueCat();
} catch (err) {
  console.warn('RevenueCat unavailable:', err);
}

function AuthGate() {
  const { user, loading } = useAuth();
  const { ready } = useI18n();
  const segments = useSegments();
  const router = useRouter();

  // Bind RevenueCat identity to the stable backend user id on every auth path.
  useEffect(() => {
    if (!rcEnabled) return;
    (async () => {
      try {
        if (user?.user_id) {
          await Purchases.logIn(user.user_id);
        } else {
          await Purchases.logOut();
        }
      } catch (e) {
        console.warn('[RevenueCat] identity error', e);
      }
    })();
  }, [user?.user_id]);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    const onVerify = segments[1] === 'verify';
    const needsVerify = !!user && user.auth_provider === 'email' && user.email_verified === false;
    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (needsVerify && !onVerify) {
      router.replace('/(auth)/verify');
    } else if (user && !needsVerify && inAuth) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, router]);

  if (loading || !ready) {
    return (
      <View style={styles.loading} testID="app-loading">
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-discovery" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ai-discover" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="movie/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="list/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="list/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="legal/[doc]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <SubscriptionProvider>
              <I18nProvider>
                <ToastProvider>
                  <AuthGate />
                </ToastProvider>
              </I18nProvider>
            </SubscriptionProvider>
          </QueryClientProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
