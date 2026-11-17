import { createSetting } from '@basalt/core';
import type { AsrSchool, CalcMethod, Location } from './prayer';
import { CITIES } from './prayer';
import type { Rule } from './types';

export const rulesSetting = createSetting<Rule[]>('autopilot.rules', []);
export const locationSetting = createSetting<Location>('autopilot.location', CITIES[0]);
export const methodSetting = createSetting<CalcMethod>('autopilot.method', 'karachi');
export const schoolSetting = createSetting<AsrSchool>('autopilot.school', 'hanafi');
export const pausedSetting = createSetting<boolean>('autopilot.paused', false);
export const onboardedSetting = createSetting<boolean>('autopilot.onboarded', false);

export const UPDATE_SOURCE = { owner: 'muhammadahmad545-code', repo: 'autopilot' } as const;
export const REPO_URL = `https://github.com/${UPDATE_SOURCE.owner}/${UPDATE_SOURCE.repo}`;
export const ACCENT = { dark: '#818CF8', dark2: '#6366F1', light: '#4F46E5', light2: '#4338CA', onAccent: '#0F1033' } as const;
