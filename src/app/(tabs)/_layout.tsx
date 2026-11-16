import { SlotTabs } from '@basalt/core';
import History from 'lucide-react-native/icons/rotate-ccw-clock';
import Settings from 'lucide-react-native/icons/settings';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Workflow from 'lucide-react-native/icons/workflow';
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
