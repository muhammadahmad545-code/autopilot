export type PrayerName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type OnOff = 'connected' | 'disconnected';

export type Trigger =
  | { type: 'time'; hour: number; minute: number; days: number[] }
  | { type: 'prayer'; prayer: PrayerName; offsetMinutes: number }
  | { type: 'charging'; state: OnOff }
  | { type: 'battery'; direction: 'below' | 'above'; level: number }
  | { type: 'headphones'; state: OnOff }
  | { type: 'wifi'; state: OnOff; ssid: string };

export type TriggerType = Trigger['type'];

export type Action =
  | { type: 'ringer'; mode: 'normal' | 'vibrate' | 'silent' }
  | { type: 'dnd'; on: boolean }
  | { type: 'mediaVolume'; percent: number }
  | { type: 'ringVolume'; percent: number }
  | { type: 'brightness'; percent: number }
  | { type: 'flashlight'; on: boolean }
  | { type: 'notify'; title: string; body: string };

export type ActionType = Action['type'];

export interface Conditions {
  /** ISO weekdays, 1 = Monday … 7 = Sunday. Empty or missing = every day. */
  days?: number[];
  /** Minutes since midnight. end < start wraps past midnight. */
  window?: { start: number; end: number };
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions?: Conditions;
  actions: Action[];
  createdAt: number;
}

export interface LogEntry {
  at: number;
  ruleId: string;
  ruleName: string;
  cause: string;
  skipped: string | null;
  results: { action: string; error: string | null }[];
}
