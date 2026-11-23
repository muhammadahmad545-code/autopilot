import type { Action, Rule, Trigger } from './types';
import { validate } from './describe';

const TRIGGERS = new Set(['time', 'prayer', 'charging', 'battery', 'headphones', 'wifi', 'unlock', 'powerSave']);
const ACTIONS = new Set(['ringer', 'dnd', 'mediaVolume', 'ringVolume', 'brightness', 'flashlight', 'notify', 'vibrate', 'autoRotate', 'speak']);

export interface ExportFile {
  app: 'basalt-autopilot';
  version: 1;
  rules: Rule[];
}

export function exportRules(rules: Rule[]): string {
  const file: ExportFile = { app: 'basalt-autopilot', version: 1, rules };
  return JSON.stringify(file, null, 2);
}

/**
 * Parse rules pasted by the user. Everything is checked, because the text comes from outside the app.
 * Imported rules get fresh ids and start disabled, so nothing runs until the user reviews it.
 */
export function importRules(text: string, newId: () => string): { rules: Rule[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That is not Autopilot rules text. Use “Export rules” on the other phone and copy all of it.');
  }
  const list = (parsed as Partial<ExportFile>)?.app === 'basalt-autopilot' ? (parsed as ExportFile).rules : null;
  if (!Array.isArray(list)) throw new Error('That is not Autopilot rules text.');
  const rules: Rule[] = [];
  let skipped = 0;
  for (const raw of list.slice(0, 200)) {
    const r = raw as Partial<Rule>;
    const trigger = r?.trigger as Trigger | undefined;
    const actions = Array.isArray(r?.actions) ? (r.actions as Action[]).filter((a) => a && ACTIONS.has(a.type)) : [];
    if (!trigger || !TRIGGERS.has(trigger.type) || typeof r.name !== 'string' || actions.length === 0) {
      skipped++;
      continue;
    }
    const rule: Rule = {
      id: newId(),
      name: r.name.slice(0, 60),
      enabled: false,
      trigger,
      conditions: r.conditions && typeof r.conditions === 'object' ? r.conditions : undefined,
      actions,
      createdAt: Date.now(),
    };
    if (validate(rule).length > 0) {
      skipped++;
      continue;
    }
    rules.push(rule);
  }
  return { rules, skipped };
}
