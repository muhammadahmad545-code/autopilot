import { Button, Card, EmptyState, Header, Screen, Text, formatRelativeTime, useTheme, useToast } from '@basalt/core';
import { useRouter } from 'expo-router';
import { CircleAlert, CircleCheck, CircleMinus, History, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Alert, View } from 'react-native';
import { ACTION_LABELS } from '../lib/describe';
import { Engine } from '../lib/engine';
import type { ActionType } from '../lib/types';
import { useLog } from '../lib/useLog';

export default function Log() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [log, reload] = useLog();

  const clear = () =>
    Alert.alert('Clear activity?', 'This removes the run history on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          try {
            Engine.clearLog();
            reload();
          } catch {
            toast('Could not clear activity.', 'danger');
          }
        },
      },
    ]);

  return (
    <Screen>
      <Header title="Activity" subtitle={`${log.length} run${log.length === 1 ? '' : 's'}`} onBack={() => router.back()} />
      {log.length === 0 ? (
        <EmptyState icon={History} title="Nothing has run yet" message="Each time a rule fires, you will see what triggered it and what every action did." />
      ) : (
        <>
          {log.map((entry) => {
            const failed = entry.results.filter((r) => r.error);
            const Icon = entry.skipped ? CircleMinus : failed.length ? CircleAlert : CircleCheck;
            const tone = entry.skipped ? colors.textMuted : failed.length ? colors.danger : colors.success;
            return (
              <Card key={`${entry.at}-${entry.ruleId}`} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Icon size={18} color={tone} />
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {entry.ruleName}
                  </Text>
                  <Text variant="caption" color="textFaint">
                    {formatRelativeTime(entry.at)}
                  </Text>
                </View>
                <Text variant="caption" color="textMuted">
                  {entry.cause}
                  {entry.skipped ? ` · skipped: ${entry.skipped}` : ''}
                </Text>
                {entry.results.map((r, i) => (
                  <Text key={i} variant="caption" color={r.error ? 'danger' : 'textMuted'}>
                    {r.error ? '✕' : '✓'} {ACTION_LABELS[r.action as ActionType] ?? r.action}
                    {r.error ? ` — ${r.error}` : ''}
                  </Text>
                ))}
              </Card>
            );
          })}
          <Button label="Clear activity" icon={Trash2} variant="danger" onPress={clear} />
        </>
      )}
    </Screen>
  );
}
