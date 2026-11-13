import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeConditions, describeDays, describeTrigger, requiredPermissions, summarize, validate } from './describe';
import { RECIPES } from './recipes';
import type { Rule } from './types';

const rule = (over: Partial<Rule>): Rule => ({ id: 'r', name: 'Test', enabled: true, createdAt: 0, trigger: { type: 'charging', state: 'connected' }, actions: [{ type: 'dnd', on: true }], ...over });

test('day sets read naturally', () => {
  assert.equal(describeDays([]), 'every day');
  assert.equal(describeDays([5, 1, 2, 3, 4]), 'weekdays');
  assert.equal(describeDays([7, 6]), 'weekends');
  assert.equal(describeDays([1, 3]), 'Mon, Wed');
});

test('triggers and conditions are described', () => {
  assert.equal(describeTrigger({ type: 'time', hour: 7, minute: 5, days: [6, 7] }), 'At 07:05, weekends');
  assert.equal(describeTrigger({ type: 'prayer', prayer: 'maghrib', offsetMinutes: -5 }), '5 min before Maghrib');
  assert.equal(describeTrigger({ type: 'wifi', state: 'disconnected', ssid: ' Home ' }), 'When leaving “Home”');
  assert.equal(describeConditions({ window: { start: 22 * 60, end: 6 * 60 } }), 'between 22:00 and 06:00');
  assert.equal(summarize(rule({})), 'When the charger is plugged in → Do Not Disturb on');
});

test('permissions follow from what the rule does', () => {
  assert.deepEqual(requiredPermissions(rule({})).sort(), ['batteryUnrestricted', 'doNotDisturb']);
  assert.deepEqual(
    requiredPermissions(rule({ trigger: { type: 'wifi', state: 'connected', ssid: 'Office' }, actions: [{ type: 'brightness', percent: 5 }] })).sort(),
    ['batteryUnrestricted', 'location', 'writeSettings'],
  );
  assert.deepEqual(requiredPermissions(rule({ trigger: { type: 'time', hour: 1, minute: 0, days: [] }, actions: [{ type: 'ringer', mode: 'vibrate' }] })), ['exactAlarms']);
});

test('validation catches empty and inconsistent rules', () => {
  assert.deepEqual(validate(rule({})), []);
  const errors = validate(rule({ name: ' ', actions: [], conditions: { window: { start: 60, end: 60 } } })).map((e) => e.field);
  assert.deepEqual(errors.sort(), ['actions', 'conditions', 'name']);
  assert.equal(validate(rule({ actions: [{ type: 'notify', title: '', body: '' }] }))[0].field, 'actions');
});

test('every recipe is a valid rule apart from Wi-Fi names the user fills in', () => {
  for (const recipe of RECIPES) {
    assert.deepEqual(validate({ ...recipe.rule, id: recipe.id, enabled: true, createdAt: 0 }), [], recipe.id);
  }
});
