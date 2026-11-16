import { Appear, Button, Card, EmptyState, Hero, Screen, StatTile, TAB_BAR_SPACE, Text, formatRelativeTime, useTheme, useToast } from '@basalt/core';
import CircleAlert from 'lucide-react-native/icons/circle-exclamation-point';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleMinus from 'lucide-react-native/icons/circle-minus';
import History from 'lucide-react-native/icons/rotate-ccw-clock';
import Trash2 from 'lucide-react-native/icons/trash';
import React from 'react';
import { Alert, View } from 'react-native';
import { ACTION_LABELS } from '../../lib/describe';
import { Engine } from '../../lib/engine';
import type { ActionType } from '../../lib/types';
import { useLog } from '../../lib/useLog';

export default function Log() {
  const { colors, spacing } = useTheme();
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
    <Screen aurora bottomSpace={TAB_BAR_SPACE}>
      <Hero overline="Autopilot" title="Activity" subtitle="Every run, what triggered it, and what each action did." />
      {log.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile label="Runs logged" value={String(log.length)} />
          <StatTile label="With a failure" value={String(log.filter((e) => e.results.some((r) => r.error)).length)} />
          <StatTile label="Skipped" value={String(log.filter((e) => e.skipped).length)} />
        </View>
      ) : null}
      {log.length === 0 ? (
        <EmptyState icon={History} title="Nothing has run yet" message="Each time a rule fires, you will see what triggered it and what every action did." />
      ) : (
        <>
          {log.map((entry, i) => {
            const failed = entry.results.filter((r) => r.error);
            const Icon = entry.skipped ? CircleMinus : failed.length ? CircleAlert : CircleCheck;
            const tone = entry.skipped ? colors.textMuted : failed.length ? colors.danger : colors.success;
            return (
              <Appear key={`${entry.at}-${entry.ruleId}`} index={i}>
              <Card style={{ gap: spacing.sm, borderColor: failed.length ? colors.danger : colors.border }}>
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
              </Appear>
            );
          })}
          <Button label="Clear activity" icon={Trash2} variant="danger" onPress={clear} />
        </>
      )}
    </Screen>
  );
}
