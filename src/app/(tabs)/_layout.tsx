import { FloatingTabBar } from '@basalt/core';
import { Tabs } from 'expo-router/js-tabs';
import { History, Settings, Sparkles, Workflow } from 'lucide-react-native';
import React from 'react';

const ITEMS = [
  { name: 'index', label: 'Rules', icon: Workflow },
  { name: 'activity', label: 'Activity', icon: History },
  { name: 'recipes', label: 'Recipes', icon: Sparkles },
  { name: 'settings', label: 'Settings', icon: Settings },
];

export default function TabsLayout() {
  console.log('[diag] TabsLayout render');
  return <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => {
        console.log('[diag] tabBar', JSON.stringify({ index: props.state.index, routes: props.state.routes.map((r) => r.name) }));
        return <FloatingTabBar {...props} items={ITEMS} />;
      }} />;
}
