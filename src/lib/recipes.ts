import type { Rule } from './types';

export interface Recipe {
  id: string;
  title: string;
  blurb: string;
  rule: Omit<Rule, 'id' | 'createdAt' | 'enabled'>;
}

export const RECIPES: Recipe[] = [
  {
    id: 'prayer-silent',
    title: 'Silent for Maghrib',
    blurb: 'Silence the phone 5 minutes before Maghrib and turn the ringer back on 25 minutes later.',
    rule: { name: 'Silent for Maghrib', trigger: { type: 'prayer', prayer: 'maghrib', offsetMinutes: -5 }, actions: [{ type: 'ringer', mode: 'silent' }] },
  },
  {
    id: 'prayer-ring',
    title: 'Ringer back after Maghrib',
    blurb: 'Pairs with the recipe above.',
    rule: { name: 'Ringer back after Maghrib', trigger: { type: 'prayer', prayer: 'maghrib', offsetMinutes: 25 }, actions: [{ type: 'ringer', mode: 'normal' }] },
  },
  {
    id: 'bedtime',
    title: 'Bedtime',
    blurb: 'At 23:00 turn on Do Not Disturb and dim the screen.',
    rule: { name: 'Bedtime', trigger: { type: 'time', hour: 23, minute: 0, days: [] }, actions: [{ type: 'dnd', on: true }, { type: 'brightness', percent: 10 }] },
  },
  {
    id: 'morning',
    title: 'Good morning',
    blurb: 'At 07:00 on weekdays turn Do Not Disturb off and the ringer on.',
    rule: { name: 'Good morning', trigger: { type: 'time', hour: 7, minute: 0, days: [1, 2, 3, 4, 5] }, actions: [{ type: 'dnd', on: false }, { type: 'ringer', mode: 'normal' }] },
  },
  {
    id: 'battery-saver',
    title: 'Low battery',
    blurb: 'Below 20%: dim the screen and remind you to charge.',
    rule: {
      name: 'Low battery',
      trigger: { type: 'battery', direction: 'below', level: 20 },
      actions: [{ type: 'brightness', percent: 20 }, { type: 'notify', title: 'Battery low', body: 'Brightness lowered to save power. Plug in soon.' }],
    },
  },
  {
    id: 'battery-80',
    title: 'Unplug at 80%',
    blurb: 'Remind you to unplug at 80% to keep the battery healthy.',
    rule: { name: 'Unplug at 80%', trigger: { type: 'battery', direction: 'above', level: 80 }, actions: [{ type: 'notify', title: 'Battery at 80%', body: 'Unplug now to extend battery life.' }] },
  },
  {
    id: 'night-charge',
    title: 'Charging at night',
    blurb: 'Plugging in between 22:00 and 06:00 turns on Do Not Disturb.',
    rule: {
      name: 'Charging at night',
      trigger: { type: 'charging', state: 'connected' },
      conditions: { window: { start: 22 * 60, end: 6 * 60 } },
      actions: [{ type: 'dnd', on: true }],
    },
  },
  {
    id: 'headphones',
    title: 'Headphones in',
    blurb: 'Set media volume to 40% when headphones connect, so nothing blasts.',
    rule: { name: 'Headphones in', trigger: { type: 'headphones', state: 'connected' }, actions: [{ type: 'mediaVolume', percent: 40 }] },
  },
  {
    id: 'office',
    title: 'Quiet at the office',
    blurb: 'Vibrate only when you join the office Wi-Fi. Enter your network name.',
    rule: { name: 'Quiet at the office', trigger: { type: 'wifi', state: 'connected', ssid: '' }, conditions: { days: [1, 2, 3, 4, 5] }, actions: [{ type: 'ringer', mode: 'vibrate' }] },
  },
  {
    id: 'leave-home',
    title: 'Leaving home',
    blurb: 'Remind you to take your keys and wallet when the phone leaves home Wi-Fi.',
    rule: { name: 'Leaving home', trigger: { type: 'wifi', state: 'disconnected', ssid: '' }, actions: [{ type: 'notify', title: 'Keys, wallet, charger?', body: 'You just left home Wi-Fi.' }] },
  },
];
