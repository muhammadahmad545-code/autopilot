import { SlotTabs } from '@basalt/core';
import { History, Settings, Sparkles, Workflow } from 'lucide-react-native';
import React from 'react';

const TABS = [
  { href: '/', label: 'Rules', icon: Workflow },
  { href: '/activity', label: 'Activity', icon: History },
  { href: '/recipes', label: 'Recipes', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function TabsLayout() {
  return <SlotTabs tabs={TABS} />;
}
