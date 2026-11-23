import { ErrorBoundary, Onboarding, ThemeProvider, ToastProvider, useBasaltFonts, useTheme } from '@basalt/core';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import History from 'lucide-react-native/icons/rotate-ccw-clock';
import MoonStar from 'lucide-react-native/icons/moon-star';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Workflow from 'lucide-react-native/icons/workflow';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Engine, syncEngine } from '../lib/engine';
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
  if (!onboarded) return <Onboarding appName="Autopilot" pages={PAGES} onDone={() => setOnboarded(true)} />;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />
    </>
  );
}

export default function RootLayout() {
  const fontsReady = useBasaltFonts();

  useEffect(() => {
    // Refresh the 120-day prayer schedule and re-arm alarms every time the app opens.
    syncEngine();
    try {
      Engine.installShortcuts();
    } catch {
      // Launcher shortcuts are a nice-to-have.
    }
  }, []);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <ErrorBoundary>
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
