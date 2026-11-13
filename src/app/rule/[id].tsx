import { Button, Card, Chip, Header, IconButton, ListItem, Pressable, Screen, SectionTitle, SegmentedControl, Text, TextField, Toggle, toMessage, useTheme, useToast } from '@basalt/core';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleAlert, FlaskConical, Plus, Trash2, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { DayPicker } from '../../components/DayPicker';
import { ACTION_ICONS, TRIGGER_ICONS } from '../../components/icons';
import { Stepper, TimeField } from '../../components/Stepper';
import { ACTION_LABELS, TRIGGER_LABELS, describeAction, describeTrigger, requiredPermissions, validate } from '../../lib/describe';
import { Engine, saveRules, toNative } from '../../lib/engine';
import { PRAYERS, PRAYER_LABELS } from '../../lib/prayer';
import { RECIPES } from '../../lib/recipes';
import { rulesSetting } from '../../lib/settings';
import type { Action, ActionType, Rule, Trigger, TriggerType } from '../../lib/types';
import { requestLocation, usePermissions } from '../../lib/usePermissions';

const DEFAULT_TRIGGERS: Record<TriggerType, Trigger> = {
  time: { type: 'time', hour: 22, minute: 0, days: [] },
  prayer: { type: 'prayer', prayer: 'maghrib', offsetMinutes: 0 },
  charging: { type: 'charging', state: 'connected' },
  battery: { type: 'battery', direction: 'below', level: 20 },
  headphones: { type: 'headphones', state: 'connected' },
  wifi: { type: 'wifi', state: 'connected', ssid: '' },
};

const DEFAULT_ACTIONS: Record<ActionType, Action> = {
  ringer: { type: 'ringer', mode: 'vibrate' },
  dnd: { type: 'dnd', on: true },
  mediaVolume: { type: 'mediaVolume', percent: 40 },
  ringVolume: { type: 'ringVolume', percent: 60 },
  brightness: { type: 'brightness', percent: 30 },
  flashlight: { type: 'flashlight', on: true },
  notify: { type: 'notify', title: '', body: '' },
};

const PERMISSION_LABELS: Record<string, string> = {
  notifications: 'Notifications',
  doNotDisturb: 'Do Not Disturb access',
  writeSettings: 'Modify system settings',
  exactAlarms: 'Alarms & reminders',
  batteryUnrestricted: 'Unrestricted battery use',
  location: 'Location (to read Wi-Fi names)',
};

function blankRule(recipeId?: string): Rule {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  const base = recipe?.rule ?? { name: '', trigger: DEFAULT_TRIGGERS.time, actions: [] };
  return { ...structuredClone(base), id: Crypto.randomUUID(), enabled: true, createdAt: Date.now() };
}

export default function RuleEditor() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string; recipe?: string }>();
  const [rules] = rulesSetting.use();
  const existing = rules.find((r) => r.id === params.id);
  const [draft, setDraft] = useState<Rule>(() => (existing ? structuredClone(existing) : blankRule(params.recipe)));
  const [showErrors, setShowErrors] = useState(false);
  const [permissions] = usePermissions();

  const errors = useMemo(() => validate(draft), [draft]);
  const errorFor = (field: string) => (showErrors ? errors.find((e) => e.field === field)?.message : undefined);
  const missing = useMemo(
    () => (permissions ? requiredPermissions(draft).filter((p) => !permissions[p]) : []),
    [draft, permissions],
  );

  const update = (patch: Partial<Rule>) => setDraft((d) => ({ ...d, ...patch }));
  const setTrigger = (trigger: Trigger) => update({ trigger });
  const setAction = (index: number, action: Action) => update({ actions: draft.actions.map((a, i) => (i === index ? action : a)) });
  const removeAction = (index: number) => update({ actions: draft.actions.filter((_, i) => i !== index) });
  const window = draft.conditions?.window;

  const save = () => {
    setShowErrors(true);
    if (errors.length > 0) return toast(errors[0].message, 'danger');
    const next = existing ? rules.map((r) => (r.id === draft.id ? draft : r)) : [...rules, draft];
    const error = saveRules(next);
    if (error) return toast(error, 'danger');
    toast(existing ? 'Rule updated' : 'Rule created', 'success');
    router.back();
  };

  const test = () => {
    if (draft.actions.length === 0) return toast('Add an action to test.', 'danger');
    try {
      const results = Engine.runNow(JSON.stringify(toNative(draft)));
      const failed = results.filter((r) => r.error);
      if (failed.length === 0) toast('All actions ran', 'success');
      else toast(`${failed.length} action${failed.length === 1 ? '' : 's'} failed: ${failed[0].error}`, 'danger');
    } catch (error) {
      toast(toMessage(error, 'The test could not run.'), 'danger');
    }
  };

  const remove = () => {
    Alert.alert('Delete this rule?', draft.name || 'This rule', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const error = saveRules(rules.filter((r) => r.id !== draft.id));
          if (error) return toast(error, 'danger');
          router.back();
        },
      },
    ]);
  };

  const t = draft.trigger;

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Test now" icon={FlaskConical} variant="secondary" size="lg" onPress={test} style={{ flex: 1 }} />
          <Button label="Save" size="lg" onPress={save} style={{ flex: 1 }} />
        </View>
      }
    >
      <Header
        title={existing ? 'Edit rule' : 'New rule'}
        subtitle={describeTrigger(draft.trigger)}
        onBack={() => router.back()}
        right={existing ? <IconButton icon={Trash2} label="Delete rule" tone="danger" onPress={remove} /> : undefined}
      />

      <TextField label="Name" value={draft.name} onChangeText={(name) => update({ name })} placeholder="e.g. Quiet at night" maxLength={60} error={errorFor('name')} />

      {missing.length > 0 ? (
        <Card onPress={() => router.push('/permissions')} style={{ flexDirection: 'row', gap: spacing.md, borderColor: colors.warning }}>
          <CircleAlert size={20} color={colors.warning} />
          <Text variant="caption" style={{ flex: 1 }}>
            This rule needs: {missing.map((p) => PERMISSION_LABELS[p]).join(', ')}. Tap to grant.
          </Text>
        </Card>
      ) : null}

      <SectionTitle title="When" />
      <Card style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((type) => (
            <Chip key={type} label={TRIGGER_LABELS[type]} icon={TRIGGER_ICONS[type]} selected={t.type === type} onPress={() => t.type !== type && setTrigger(structuredClone(DEFAULT_TRIGGERS[type]))} />
          ))}
        </View>

        {t.type === 'time' ? (
          <>
            <TimeField label="Time" minutes={t.hour * 60 + t.minute} onChange={(m) => setTrigger({ ...t, hour: Math.floor(m / 60), minute: m % 60 })} />
            <DayPicker days={t.days} onChange={(days) => setTrigger({ ...t, days })} />
          </>
        ) : null}

        {t.type === 'prayer' ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {PRAYERS.map((p) => (
                <Chip key={p} label={PRAYER_LABELS[p]} selected={t.prayer === p} onPress={() => setTrigger({ ...t, prayer: p })} />
              ))}
            </View>
            <View style={{ gap: spacing.xs }}>
              <Text variant="label" color="textMuted">
                Offset
              </Text>
              <Stepper
                label="Offset in minutes"
                value={t.offsetMinutes}
                min={-120}
                max={120}
                step={5}
                format={(v) => (v === 0 ? 'On time' : `${Math.abs(v)} min ${v < 0 ? 'before' : 'after'}`)}
                onChange={(offsetMinutes) => setTrigger({ ...t, offsetMinutes })}
              />
            </View>
            <Text variant="caption" color="textMuted">
              Times are calculated on the phone for the location in Settings.
            </Text>
          </>
        ) : null}

        {t.type === 'charging' || t.type === 'headphones' ? (
          <SegmentedControl
            options={[
              { value: 'connected', label: t.type === 'charging' ? 'Plugged in' : 'Connected' },
              { value: 'disconnected', label: t.type === 'charging' ? 'Unplugged' : 'Disconnected' },
            ]}
            value={t.state}
            onChange={(state) => setTrigger({ ...t, state })}
          />
        ) : null}

        {t.type === 'battery' ? (
          <>
            <SegmentedControl
              options={[
                { value: 'below', label: 'Drops below' },
                { value: 'above', label: 'Reaches' },
              ]}
              value={t.direction}
              onChange={(direction) => setTrigger({ ...t, direction })}
            />
            <Stepper label="Battery level" value={t.level} min={5} max={100} step={5} format={(v) => `${v}%`} onChange={(level) => setTrigger({ ...t, level })} />
          </>
        ) : null}

        {t.type === 'wifi' ? (
          <>
            <SegmentedControl
              options={[
                { value: 'connected', label: 'Connects' },
                { value: 'disconnected', label: 'Disconnects' },
              ]}
              value={t.state}
              onChange={(state) => setTrigger({ ...t, state })}
            />
            <TextField
              label="Network name (optional)"
              value={t.ssid}
              onChangeText={(ssid) => setTrigger({ ...t, ssid })}
              placeholder="Leave empty for any Wi-Fi"
              autoCapitalize="none"
              autoCorrect={false}
              hint="Matching a specific network needs location access, because Android treats Wi-Fi names as location."
            />
            {t.ssid.trim() && permissions && !permissions.location ? (
              <Button
                label="Allow reading Wi-Fi names"
                variant="secondary"
                onPress={async () => {
                  const ok = await requestLocation();
                  toast(ok ? 'Wi-Fi names can now be matched' : 'Without location, only “any Wi-Fi” works', ok ? 'success' : 'danger');
                }}
              />
            ) : null}
          </>
        ) : null}
      </Card>

      <SectionTitle title="Only if (optional)" />
      <Card style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" color="textMuted">
            On these days
          </Text>
          <DayPicker days={draft.conditions?.days ?? []} onChange={(days) => update({ conditions: { ...draft.conditions, days } })} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="label" color="textMuted">
            Only between certain hours
          </Text>
          <Toggle
            value={!!window}
            accessibilityLabel="Limit to a time window"
            onChange={(on) => update({ conditions: { ...draft.conditions, window: on ? { start: 22 * 60, end: 7 * 60 } : undefined } })}
          />
        </View>
        {window ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="caption" color="textMuted">
              From
            </Text>
            <TimeField label="Window start" minutes={window.start} onChange={(start) => update({ conditions: { ...draft.conditions, window: { ...window, start } } })} />
            <Text variant="caption" color="textMuted">
              Until
            </Text>
            <TimeField label="Window end" minutes={window.end} onChange={(end) => update({ conditions: { ...draft.conditions, window: { ...window, end } } })} />
            {errorFor('conditions') ? (
              <Text variant="caption" color="danger">
                {errorFor('conditions')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      <SectionTitle title="Do" />
      {draft.actions.map((action, index) => (
        <Card key={index} style={{ gap: spacing.md }}>
          <ListItem
            title={ACTION_LABELS[action.type]}
            subtitle={describeAction(action)}
            icon={ACTION_ICONS[action.type]}
            trailing={
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${ACTION_LABELS[action.type]}`} hitSlop={12} onPress={() => removeAction(index)}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            }
          />
          {action.type === 'ringer' ? (
            <SegmentedControl
              options={[
                { value: 'normal', label: 'Ring' },
                { value: 'vibrate', label: 'Vibrate' },
                { value: 'silent', label: 'Silent' },
              ]}
              value={action.mode}
              onChange={(mode) => setAction(index, { ...action, mode })}
            />
          ) : null}
          {action.type === 'dnd' || action.type === 'flashlight' ? (
            <SegmentedControl
              options={[
                { value: 'on', label: 'Turn on' },
                { value: 'off', label: 'Turn off' },
              ]}
              value={action.on ? 'on' : 'off'}
              onChange={(v) => setAction(index, { ...action, on: v === 'on' })}
            />
          ) : null}
          {action.type === 'mediaVolume' || action.type === 'ringVolume' || action.type === 'brightness' ? (
            <Stepper label={ACTION_LABELS[action.type]} value={action.percent} min={action.type === 'brightness' ? 5 : 0} max={100} step={5} format={(v) => `${v}%`} onChange={(percent) => setAction(index, { ...action, percent })} />
          ) : null}
          {action.type === 'notify' ? (
            <>
              <TextField label="Title" value={action.title} onChangeText={(title) => setAction(index, { ...action, title })} maxLength={80} />
              <TextField label="Message" value={action.body} onChangeText={(body) => setAction(index, { ...action, body })} multiline maxLength={300} />
            </>
          ) : null}
        </Card>
      ))}
      {errorFor('actions') ? (
        <Text variant="caption" color="danger">
          {errorFor('actions')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {(Object.keys(ACTION_LABELS) as ActionType[]).map((type) => (
          <Chip key={type} label={ACTION_LABELS[type]} icon={Plus} onPress={() => update({ actions: [...draft.actions, structuredClone(DEFAULT_ACTIONS[type])] })} />
        ))}
      </View>
    </Screen>
  );
}
