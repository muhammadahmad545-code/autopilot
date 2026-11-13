import { Button, Card, EmptyState, IconButton, ListItem, Screen, SectionTitle, Text, Toggle, UpdateCard, formatRelativeTime, useTheme, useToast, useUpdater } from '@basalt/core';
import { useRouter } from 'expo-router';
import { CircleAlert, CircleCheck, Pause, Play, Plus, Settings, Sparkles, Workflow } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { TRIGGER_ICONS } from '../components/icons';
import { describeConditions, requiredPermissions, summarize } from '../lib/describe';
import { Engine, saveRules } from '../lib/engine';
import { UPDATE_SOURCE, pausedSetting, rulesSetting } from '../lib/settings';
import { useLog } from '../lib/useLog';
import { usePermissions } from '../lib/usePermissions';

export default function Home() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const updater = useUpdater({ source: UPDATE_SOURCE });
  const [rules] = rulesSetting.use();
  const [paused, setPaused] = pausedSetting.use();
  const [log] = useLog();
  const [permissions] = usePermissions();

  const missing = useMemo(() => {
    if (!permissions) return 0;
    const needed = new Set(rules.filter((r) => r.enabled).flatMap(requiredPermissions));
    return [...needed].filter((p) => !permissions[p]).length;
  }, [rules, permissions]);

  const active = rules.filter((r) => r.enabled).length;
  let nextRun: number | null = null;
  try {
    nextRun = paused ? null : Engine.nextAlarm();
  } catch {
    nextRun = null;
  }

  const toggleRule = (id: string, enabled: boolean) => {
    const error = saveRules(rules.map((r) => (r.id === id ? { ...r, enabled } : r)));
    if (error) toast(error, 'danger');
  };

  const togglePause = () => {
    try {
      Engine.setPaused(!paused);
      setPaused(!paused);
      toast(paused ? 'Autopilot resumed' : 'All rules paused', 'success');
    } catch {
      toast('Could not change the engine state.', 'danger');
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text variant="overline" color="accent">
            Basalt
          </Text>
          <Text variant="display">Autopilot</Text>
        </View>
        <IconButton icon={Settings} label="Settings" onPress={() => router.push('/settings')} />
      </View>

      <UpdateCard updater={updater} />

      <Card style={{ gap: spacing.md, backgroundColor: paused ? colors.surface : colors.accentSoft, borderColor: paused ? colors.border : colors.accent }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.lg, backgroundColor: paused ? colors.surfaceRaised : colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            {paused ? <Pause size={22} color={colors.textMuted} /> : <Workflow size={22} color={colors.onAccent} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{paused ? 'Paused' : active === 0 ? 'No active rules' : `${active} rule${active === 1 ? '' : 's'} active`}</Text>
            <Text variant="caption" color="textMuted">
              {paused ? 'Nothing will run until you resume.' : nextRun ? `Next scheduled run ${new Date(nextRun).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Runs entirely on this phone.'}
            </Text>
          </View>
          <Button label={paused ? 'Resume' : 'Pause'} icon={paused ? Play : Pause} variant="secondary" onPress={togglePause} />
        </View>
      </Card>

      {missing > 0 ? (
        <Card onPress={() => router.push('/permissions')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: colors.warning }}>
          <CircleAlert size={20} color={colors.warning} />
          <Text style={{ flex: 1 }}>
            {missing} permission{missing === 1 ? '' : 's'} needed for your rules to work. Tap to fix.
          </Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="New rule" icon={Plus} onPress={() => router.push('/rule/new')} style={{ flex: 1 }} />
        <Button label="Recipes" icon={Sparkles} variant="secondary" onPress={() => router.push('/recipes')} style={{ flex: 1 }} />
      </View>

      <SectionTitle title="Rules" />
      {rules.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No rules yet"
          message="A rule is “when this happens, do that”. Start from a recipe or build your own."
          action={<Button label="Browse recipes" icon={Sparkles} variant="secondary" onPress={() => router.push('/recipes')} />}
        />
      ) : (
        rules.map((rule) => {
          const Icon = TRIGGER_ICONS[rule.trigger.type];
          const conditions = describeConditions(rule.conditions);
          return (
            <Card key={rule.id} onPress={() => router.push({ pathname: '/rule/[id]', params: { id: rule.id } })} accessibilityLabel={`${rule.name}. ${summarize(rule)}`} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', opacity: rule.enabled ? 1 : 0.6 }}>
              <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {rule.name}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={2}>
                  {summarize(rule)}
                  {conditions ? ` · ${conditions}` : ''}
                </Text>
              </View>
              <Toggle value={rule.enabled} accessibilityLabel={`Enable ${rule.name}`} onChange={(v) => toggleRule(rule.id, v)} />
            </Card>
          );
        })
      )}

      <SectionTitle title="Recent activity" action={log.length > 0 ? 'See all' : undefined} onAction={() => router.push('/log')} />
      {log.length === 0 ? (
        <Text variant="caption" color="textMuted">
          When a rule runs, it shows up here with what it did.
        </Text>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {log.slice(0, 3).map((entry) => {
            const failed = entry.results.some((r) => r.error);
            return (
              <ListItem
                key={`${entry.at}-${entry.ruleId}`}
                title={entry.ruleName}
                subtitle={`${entry.skipped ?? entry.cause} · ${formatRelativeTime(entry.at)}`}
                icon={failed ? CircleAlert : CircleCheck}
                iconTone={failed ? 'danger' : entry.skipped ? 'textMuted' : 'success'}
              />
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
