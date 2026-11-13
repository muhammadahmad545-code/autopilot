import { ErrorBoundary, ThemeProvider, ToastProvider, useBasaltFonts, useTheme } from '@basalt/core';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { syncEngine } from '../lib/engine';
import { ACCENT } from '../lib/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { colors, scheme } = useTheme();
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
