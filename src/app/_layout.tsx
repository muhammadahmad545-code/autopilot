import { ErrorBoundary, Onboarding, ThemeProvider, ToastProvider, useBasaltFonts, useTheme } from '@basalt/core';
import { Stack } from 'expo-router/stack';
import { usePathname, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { History, MoonStar, Sparkles, Workflow } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { syncEngine } from '../lib/engine';
import { ACCENT, onboardedSetting } from '../lib/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

const PAGES = [
  { icon: Workflow, title: 'Your phone, on autopilot', body: 'Rules like “when I plug in at night, turn on Do Not Disturb” run by themselves, entirely on this phone.' },
  { icon: MoonStar, title: 'Prayer-aware', body: 'Silence the phone for each prayer with an offset you choose. Times are calculated offline for your city.' },
  { icon: Sparkles, title: 'Start from a recipe', body: 'Bedtime, low battery, quiet at the office, unplug at 80% and more. Adjust any of them in seconds.' },
  { icon: History, title: 'See every run', body: 'Each run is logged with what triggered it and what every action did, so nothing fails silently.' },
];

function Navigator() {
  const { colors, scheme } = useTheme();
  const [onboarded, setOnboarded] = onboardedSetting.use();
  const pathname = usePathname();
  const segments = useSegments();
  console.log('[diag] Navigator render', JSON.stringify({ onboarded, pathname, segments }));
  if (!onboarded) return <Onboarding appName="Autopilot" pages={PAGES} onDone={() => setOnboarded(true)} />;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />
    </>
  );
}

const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: Error, f?: boolean) => void; setGlobalHandler: (h: (e: Error, f?: boolean) => void) => void } };
if (g.ErrorUtils) {
  const prev = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((e, fatal) => {
    console.log('[diag] global error', fatal, e?.message, e?.stack?.slice(0, 600));
    prev(e, fatal);
  });
}

export default function RootLayout() {
  const fontsReady = useBasaltFonts();
  console.log('[diag] RootLayout render fontsReady=' + fontsReady);

  useEffect(() => {
    // Refresh the 120-day prayer schedule and re-arm alarms every time the app opens.
    syncEngine();
  }, []);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <ErrorBoundary onError={(e) => console.log('[diag] boundary', e.message, e.stack?.slice(0, 600))}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider accent={ACCENT}>
            <ToastProvider>
              <Navigator />
            </ToastProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
