import { Button, Card, Header, Screen, Text, useTheme, useToast } from '@basalt/core';
import { useRouter } from 'expo-router';
import { CircleAlert, CircleCheck } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import type { PermissionKey } from '../../modules/autopilot-engine';
import { Engine } from '../lib/engine';
import { requestLocation, requestNotifications, usePermissions } from '../lib/usePermissions';

const ITEMS: { key: PermissionKey | 'location'; title: string; why: string }[] = [
  { key: 'notifications', title: 'Notifications', why: 'For reminder actions, and the small “Autopilot is on” notice Android requires while it watches for changes.' },
  { key: 'exactAlarms', title: 'Alarms & reminders', why: 'Lets time and prayer rules run on the exact minute instead of when Android gets around to it.' },
  { key: 'batteryUnrestricted', title: 'Unrestricted battery', why: 'Stops Android from freezing Autopilot in the background, which would silently break charger, battery, headphone and Wi-Fi rules.' },
  { key: 'doNotDisturb', title: 'Do Not Disturb access', why: 'Needed to switch Do Not Disturb or set the phone fully silent.' },
  { key: 'writeSettings', title: 'Modify system settings', why: 'Needed only for brightness actions.' },
  { key: 'location', title: 'Location', why: 'Only for Wi-Fi rules that match a network by name. Autopilot never records where you are.' },
];

export default function Permissions() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [state, reload] = usePermissions();

  const grant = async (key: PermissionKey | 'location') => {
    try {
      if (key === 'location') {
        const ok = await requestLocation();
        if (!ok) toast('If Android stops asking, allow Location in App info.', 'danger');
      } else if (key === 'notifications' && !(await requestNotifications())) {
        Engine.openPermission('notifications');
      } else if (key !== 'notifications') {
        Engine.openPermission(key);
      }
    } finally {
      reload();
    }
  };

  return (
    <Screen>
      <Header title="Permissions" subtitle="Grant only what your rules use" onBack={() => router.back()} />
      <Card style={{ gap: spacing.sm }}>
        <Text variant="bodyStrong">Installed from outside the Play Store?</Text>
        <Text variant="caption" color="textMuted">
          If Android says a setting is restricted, open App info for Autopilot, tap the ⋮ menu, choose “Allow restricted settings”, then come back.
        </Text>
        <Button label="Open App info" variant="secondary" onPress={() => Engine.openPermission('app')} />
      </Card>
      {ITEMS.map((item) => {
        const granted = state?.[item.key] ?? false;
        return (
          <Card key={item.key} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {granted ? <CircleCheck size={18} color={colors.success} /> : <CircleAlert size={18} color={colors.warning} />}
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {item.title}
              </Text>
              <Text variant="caption" color={granted ? 'success' : 'warning'}>
                {granted ? 'Allowed' : 'Not allowed'}
              </Text>
            </View>
            <Text variant="caption" color="textMuted">
              {item.why}
            </Text>
            {!granted ? <Button label="Allow" variant="secondary" onPress={() => void grant(item.key)} /> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
