import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportRules, importRules } from './transfer';
import type { Rule } from './types';

let n = 0;
const id = () => `id-${++n}`;
const rule: Rule = { id: 'a', name: 'Bedtime', enabled: true, createdAt: 1, trigger: { type: 'time', hour: 23, minute: 0, days: [] }, actions: [{ type: 'dnd', on: true }] };

test('round-trips rules with new ids, disabled for review', () => {
  const { rules, skipped } = importRules(exportRules([rule]), id);
  assert.equal(skipped, 0);
  assert.equal(rules[0].name, 'Bedtime');
  assert.notEqual(rules[0].id, 'a');
  assert.equal(rules[0].enabled, false);
});

test('rejects foreign text and skips malformed rules', () => {
  assert.throws(() => importRules('hello', id), /not Autopilot/);
  assert.throws(() => importRules('{"rules": []}', id), /not Autopilot/);
  const mixed = JSON.stringify({ app: 'basalt-autopilot', version: 1, rules: [rule, { name: 'x', trigger: { type: 'nuke' }, actions: [{ type: 'dnd', on: true }] }, { ...rule, actions: [{ type: 'rm -rf' }] }] });
  const { rules, skipped } = importRules(mixed, id);
  assert.equal(rules.length, 1);
  assert.equal(skipped, 2);
});
