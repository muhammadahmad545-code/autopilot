import { PRAYER_LABELS } from './prayer';
import type { Action, ActionType, Conditions, Rule, Trigger, TriggerType } from './types';

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function clock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function describeDays(days: number[] | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return 'every day';
  const sorted = [...days].sort();
  if (sorted.join() === '1,2,3,4,5') return 'weekdays';
  if (sorted.join() === '6,7') return 'weekends';
  return sorted.map((d) => DAY_SHORT[d - 1]).join(', ');
}

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  time: 'Time of day',
  prayer: 'Prayer time',
  charging: 'Charger',
  battery: 'Battery level',
  headphones: 'Headphones',
  wifi: 'Wi-Fi',
};

export const ACTION_LABELS: Record<ActionType, string> = {
  ringer: 'Ringer mode',
  dnd: 'Do Not Disturb',
  mediaVolume: 'Media volume',
  ringVolume: 'Ring volume',
  brightness: 'Screen brightness',
  flashlight: 'Flashlight',
  notify: 'Show a reminder',
};

export function describeTrigger(t: Trigger): string {
  switch (t.type) {
    case 'time':
      return `At ${clock(t.hour * 60 + t.minute)}, ${describeDays(t.days)}`;
    case 'prayer': {
      const name = PRAYER_LABELS[t.prayer];
      if (t.offsetMinutes === 0) return `At ${name}`;
      const amount = Math.abs(t.offsetMinutes);
      return `${amount} min ${t.offsetMinutes < 0 ? 'before' : 'after'} ${name}`;
    }
    case 'charging':
      return t.state === 'connected' ? 'When the charger is plugged in' : 'When the charger is unplugged';
    case 'battery':
      return t.direction === 'below' ? `When battery drops below ${t.level}%` : `When battery reaches ${t.level}%`;
    case 'headphones':
      return t.state === 'connected' ? 'When headphones connect' : 'When headphones disconnect';
    case 'wifi': {
      const network = t.ssid.trim() ? `“${t.ssid.trim()}”` : 'any Wi-Fi';
      return t.state === 'connected' ? `When connecting to ${network}` : `When leaving ${network}`;
    }
  }
}

export function describeAction(a: Action): string {
  switch (a.type) {
    case 'ringer':
      return { normal: 'Ringer on', vibrate: 'Vibrate only', silent: 'Silent' }[a.mode];
    case 'dnd':
      return a.on ? 'Do Not Disturb on' : 'Do Not Disturb off';
    case 'mediaVolume':
      return `Media volume ${a.percent}%`;
    case 'ringVolume':
      return `Ring volume ${a.percent}%`;
    case 'brightness':
      return `Brightness ${a.percent}%`;
    case 'flashlight':
      return a.on ? 'Flashlight on' : 'Flashlight off';
    case 'notify':
      return `Remind: ${a.title || 'reminder'}`;
  }
}

export function describeConditions(c: Conditions | undefined): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (c.days && c.days.length > 0 && c.days.length < 7) parts.push(`only ${describeDays(c.days)}`);
  if (c.window) parts.push(`between ${clock(c.window.start)} and ${clock(c.window.end)}`);
  return parts.length ? parts.join(', ') : null;
}

export function summarize(rule: Rule): string {
  const actions = rule.actions.map(describeAction).join(' · ');
  return actions ? `${describeTrigger(rule.trigger)} → ${actions}` : describeTrigger(rule.trigger);
}

export type PermissionNeed = 'notifications' | 'doNotDisturb' | 'writeSettings' | 'exactAlarms' | 'batteryUnrestricted' | 'location';

/** Which Android permissions a rule depends on, so the editor can warn before saving. */
export function requiredPermissions(rule: Pick<Rule, 'trigger' | 'actions'>): PermissionNeed[] {
  const needs = new Set<PermissionNeed>();
  const t = rule.trigger.type;
  if (t === 'time' || t === 'prayer') needs.add('exactAlarms');
  if (t === 'charging' || t === 'battery' || t === 'headphones' || t === 'wifi') needs.add('batteryUnrestricted');
  if (rule.trigger.type === 'wifi' && rule.trigger.ssid.trim()) needs.add('location');
  for (const a of rule.actions) {
    if (a.type === 'dnd' || (a.type === 'ringer' && a.mode === 'silent')) needs.add('doNotDisturb');
    if (a.type === 'brightness') needs.add('writeSettings');
    if (a.type === 'notify') needs.add('notifications');
  }
  return [...needs];
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validate(rule: Rule): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!rule.name.trim()) errors.push({ field: 'name', message: 'Give the rule a name.' });
  if (rule.actions.length === 0) errors.push({ field: 'actions', message: 'Add at least one action.' });
  const t = rule.trigger;
  if (t.type === 'time' && (t.hour < 0 || t.hour > 23 || t.minute < 0 || t.minute > 59)) errors.push({ field: 'trigger', message: 'Pick a valid time.' });
  if (t.type === 'battery' && (t.level < 1 || t.level > 100)) errors.push({ field: 'trigger', message: 'Battery level must be 1–100%.' });
  if (t.type === 'prayer' && Math.abs(t.offsetMinutes) > 120) errors.push({ field: 'trigger', message: 'Keep the offset within two hours.' });
  if (rule.conditions?.window && rule.conditions.window.start === rule.conditions.window.end) {
    errors.push({ field: 'conditions', message: 'The time window starts and ends at the same time.' });
  }
  for (const a of rule.actions) {
    if (a.type === 'notify' && !a.title.trim()) errors.push({ field: 'actions', message: 'Reminders need a title.' });
  }
  return errors;
}
