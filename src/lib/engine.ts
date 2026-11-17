import Engine from '../../modules/autopilot-engine';
import type { PermissionState } from '../../modules/autopilot-engine';
import { upcomingPrayerTimes } from './prayer';
import { locationSetting, methodSetting, rulesSetting, schoolSetting } from './settings';
import type { LogEntry, Rule } from './types';

/** Rule as the native engine wants it: prayer triggers carry precomputed timestamps. */
export function toNative(rule: Rule): Record<string, unknown> {
  if (rule.trigger.type !== 'prayer') return { ...rule };
  const times = upcomingPrayerTimes(rule.trigger.prayer, rule.trigger.offsetMinutes, locationSetting.get(), methodSetting.get(), schoolSetting.get());
  return { ...rule, trigger: { ...rule.trigger, times } };
}

/** Push the current rules to the engine. Safe to call often; the engine re-arms itself. */
export function syncEngine(rules: Rule[] = rulesSetting.get()): string | null {
  // If the stored rules could not be read, never push an empty list over the engine's own copy.
  if (rulesSetting.readFailed()) return 'Your saved rules could not be read. The engine keeps running the last rules it had.';
  try {
    Engine.setRules(JSON.stringify(rules.map(toNative)));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'The automation engine could not be updated.';
  }
}

export function saveRules(rules: Rule[]): string | null {
  rulesSetting.set(rules);
  return syncEngine(rules);
}

/** Earliest last precomputed prayer timestamp across enabled prayer rules, i.e. when the schedule runs out. */
export function prayerHorizon(rules: Rule[]): number | null {
  const ends = rules.filter((r) => r.enabled && r.trigger.type === 'prayer').map((r) => {
    const times = (toNative(r).trigger as { times?: number[] }).times ?? [];
    return times[times.length - 1] ?? 0;
  });
  return ends.length ? Math.min(...ends) : null;
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

export interface PauseState {
  paused: boolean;
  /** Epoch ms when a timed pause ends, or 0. */
  until: number;
}

/** The engine is the source of truth for pausing; it also ends timed pauses by itself. */
export function readPause(): PauseState {
  try {
    return { paused: Engine.isPaused(), until: Engine.pausedUntil() };
  } catch {
    return { paused: false, until: 0 };
  }
}
