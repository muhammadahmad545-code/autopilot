import Engine from '../../modules/autopilot-engine';
import type { PermissionState } from '../../modules/autopilot-engine';
import { upcomingPrayerTimes } from './prayer';
import { locationSetting, methodSetting, pausedSetting, rulesSetting, schoolSetting } from './settings';
import type { LogEntry, Rule } from './types';

/** Rule as the native engine wants it: prayer triggers carry precomputed timestamps. */
export function toNative(rule: Rule): Record<string, unknown> {
  if (rule.trigger.type !== 'prayer') return { ...rule };
  const times = upcomingPrayerTimes(rule.trigger.prayer, rule.trigger.offsetMinutes, locationSetting.get(), methodSetting.get(), schoolSetting.get());
  return { ...rule, trigger: { ...rule.trigger, times } };
}

/** Push the current rules to the engine. Safe to call often; the engine re-arms itself. */
export function syncEngine(rules: Rule[] = rulesSetting.get()): string | null {
  try {
    Engine.setRules(JSON.stringify(rules.map(toNative)));
    if (Engine.isPaused() !== pausedSetting.get()) Engine.setPaused(pausedSetting.get());
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'The automation engine could not be updated.';
  }
}

export function saveRules(rules: Rule[]): string | null {
  rulesSetting.set(rules);
  return syncEngine(rules);
}

export function readLog(): LogEntry[] {
  try {
    const parsed = JSON.parse(Engine.getLog()) as LogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readPermissions(): PermissionState | null {
  try {
    return Engine.getPermissions();
  } catch {
    return null;
  }
}

export { Engine };
