import { Appear, Button, Card, EmptyState, Hero, IconButton, Ring, Screen, SectionTitle, TAB_BAR_SPACE, Text, Toggle, UpdateCard, formatRelativeTime, useTheme, useToast, useUpdater } from '@basalt/core';
import { useRouter } from 'expo-router';
import { CircleAlert, KeyRound, Pause, Play, Plus, Sparkles, Workflow } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { TRIGGER_ICONS } from '../../components/icons';
import { describeConditions, requiredPermissions, summarize } from '../../lib/describe';
import { Engine, saveRules } from '../../lib/engine';
import { PRAYERS, PRAYER_LABELS, prayerTimes } from '../../lib/prayer';
import { UPDATE_SOURCE, locationSetting, methodSetting, pausedSetting, rulesSetting, schoolSetting } from '../../lib/settings';
import { useLog } from '../../lib/useLog';
import { countdown, useNow } from '../../lib/useNow';
import { usePermissions } from '../../lib/usePermissions';

export default function Rules() {
  console.log('[diag] Rules screen render');
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const updater = useUpdater({ source: UPDATE_SOURCE });
  const [rules] = rulesSetting.use();
  const [paused, setPaused] = pausedSetting.use();
  const [location] = locationSetting.use();
  const [method] = methodSetting.use();
  const [school] = schoolSetting.use();
  const [log] = useLog();
  const [permissions] = usePermissions();

  const missing = useMemo(() => {
    if (!permissions) return 0;
    const needed = new Set(rules.filter((r) => r.enabled).flatMap(requiredPermissions));
    return [...needed].filter((p) => !permissions[p]).length;
  }, [rules, permissions]);

  const today = useMemo(() => {
    const d = new Date(now);
    return prayerTimes(d, location, method, school);
  }, [now, location, method, school]);
  const nextPrayer = PRAYERS.filter((p) => p !== 'sunrise').find((p) => (today[p]?.getTime() ?? 0) > now);

  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  const ranToday = log.filter((e) => e.at >= startOfDay && !e.skipped).length;
  const lastRun = useMemo(() => {
    const map = new Map<string, { at: number; failed: boolean; count: number }>();
    for (const e of log) {
      const cur = map.get(e.ruleId);
      if (!cur) map.set(e.ruleId, { at: e.at, failed: e.results.some((r) => r.error), count: 1 });
      else cur.count++;
    }
    return map;
  }, [log]);

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
    <Screen aurora bottomSpace={TAB_BAR_SPACE}>
      <Hero overline="Basalt" title="Autopilot" right={<IconButton icon={paused ? Play : Pause} label={paused ? 'Resume all rules' : 'Pause all rules'} tone={paused ? 'accent' : 'text'} onPress={togglePause} />} />
      <UpdateCard updater={updater} />

      <Appear index={0}>
        <Card variant="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Ring progress={rules.length ? active / rules.length : 0} size={112} stroke={12} tone={paused ? 'warning' : 'accent'}>
            <Text variant="display">{active}</Text>
            <Text variant="caption" color="textMuted">
              active
            </Text>
          </Ring>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="heading">{paused ? 'Paused' : active ? 'Running on this phone' : 'No active rules'}</Text>
            <Text variant="caption" color="textMuted">
              {paused ? 'Nothing runs until you resume.' : nextRun ? `Next scheduled run ${countdown(nextRun - now)}` : 'Event rules wait for their trigger.'}
            </Text>
            <Text variant="caption" color="accent">
              {ranToday} run{ranToday === 1 ? '' : 's'} today
            </Text>
          </View>
        </Card>
      </Appear>

      <Appear index={1}>
        <Card onPress={() => router.push('/settings')} style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label" color="textMuted">
              Prayer times · {location.name}
            </Text>
            {nextPrayer && today[nextPrayer] ? (
              <Text variant="label" color="accent">
                {PRAYER_LABELS[nextPrayer]} {countdown(today[nextPrayer]!.getTime() - now)}
              </Text>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {PRAYERS.map((p) => {
              const next = p === nextPrayer;
              return (
                <View key={p} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: next ? colors.accent : colors.surfaceRaised, minWidth: 74, alignItems: 'center' }}>
                  <Text variant="caption" style={{ color: next ? colors.onAccent : colors.textMuted }}>
                    {PRAYER_LABELS[p]}
                  </Text>
                  <Text variant="bodyStrong" style={{ color: next ? colors.onAccent : colors.text }}>
                    {today[p] ? today[p]!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </Card>
      </Appear>

      {missing > 0 ? (
        <Card onPress={() => router.push('/permissions')} variant="glow" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: colors.warning }}>
          <KeyRound size={20} color={colors.warning} />
          <Text style={{ flex: 1 }}>
            {missing} permission{missing === 1 ? '' : 's'} needed for your rules to work. Tap to fix.
          </Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="New rule" icon={Plus} onPress={() => router.push('/rule/new')} style={{ flex: 1 }} />
        <Button label="Recipes" icon={Sparkles} variant="secondary" onPress={() => router.push('/recipes')} style={{ flex: 1 }} />
      </View>

      <SectionTitle title={`Rules · ${rules.length}`} />
      {rules.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No rules yet"
          message="A rule is “when this happens, do that”. Start from a recipe or build your own."
          action={<Button label="Browse recipes" icon={Sparkles} variant="secondary" onPress={() => router.push('/recipes')} />}
        />
      ) : (
        rules.map((rule, i) => {
          const Icon = TRIGGER_ICONS[rule.trigger.type];
          const conditions = describeConditions(rule.conditions);
          const last = lastRun.get(rule.id);
          return (
            <Appear key={rule.id} index={i + 2}>
              <Card onPress={() => router.push({ pathname: '/rule/[id]', params: { id: rule.id } })} accessibilityLabel={`${rule.name}. ${summarize(rule)}`} style={{ gap: spacing.sm, opacity: rule.enabled ? 1 : 0.55 }}>
                <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={22} color={colors.accent} />
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
                </View>
                {last ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    {last.failed ? <CircleAlert size={13} color={colors.danger} /> : null}
                    <Text variant="caption" color={last.failed ? 'danger' : 'textFaint'}>
                      Last ran {formatRelativeTime(last.at)}
                      {last.failed ? ' · an action failed' : ''} · {last.count} run{last.count === 1 ? '' : 's'} logged
                    </Text>
                  </View>
                ) : null}
              </Card>
            </Appear>
          );
        })
      )}
    </Screen>
  );
}
