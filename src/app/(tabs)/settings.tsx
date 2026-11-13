import { Button, Card, Chip, Hero, ListItem, Screen, SectionTitle, SegmentedControl, TAB_BAR_SPACE, Text, TextField, UpdateCard, themePreference, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { ClipboardPaste, Code, KeyRound, MapPin, RefreshCw, Share2, ShieldCheck, Sparkles } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { prayerHorizon, saveRules, syncEngine } from '../../lib/engine';
import { exportRules, importRules } from '../../lib/transfer';
import { CITIES, METHODS, PRAYERS, PRAYER_LABELS, prayerTimes } from '../../lib/prayer';
import type { CalcMethod } from '../../lib/prayer';
import { REPO_URL, UPDATE_SOURCE, locationSetting, methodSetting, onboardedSetting, rulesSetting, schoolSetting } from '../../lib/settings';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export default function Settings() {
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [theme, setTheme] = themePreference.use();
  const [location, setLocation] = locationSetting.use();
  const [method, setMethod] = methodSetting.use();
  const [school, setSchool] = schoolSetting.use();
  const [lat, setLat] = useState(String(location.lat));
  const [lng, setLng] = useState(String(location.lng));
  const updater = useUpdater({ source: UPDATE_SOURCE, auto: false });

  const today = useMemo(() => prayerTimes(new Date(), location, method, school), [location, method, school]);

  const apply = (next: () => void) => {
    next();
    const error = syncEngine();
    if (error) toast(error, 'danger');
  };

  const [rules] = rulesSetting.use();
  const horizon = prayerHorizon(rules);

  const exportAll = async () => {
    if (rules.length === 0) return toast('There are no rules to export.');
    try {
      await Share.share({ message: exportRules(rules), title: 'Autopilot rules' });
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

  const importFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const { rules: incoming, skipped } = importRules(text, () => Crypto.randomUUID());
      if (incoming.length === 0) return toast('No usable rules were found in the copied text.', 'danger');
      const error = saveRules([...rules, ...incoming]);
      if (error) return toast(error, 'danger');
      toast(`Imported ${incoming.length} rule${incoming.length === 1 ? '' : 's'}, turned off for you to review${skipped ? ` (${skipped} skipped)` : ''}.`, 'success');
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

  const saveCoordinates = () => {
    if (!lat.trim() || !lng.trim()) return toast('Enter both latitude and longitude.', 'danger');
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
      return toast('Latitude must be −90 to 90 and longitude −180 to 180.', 'danger');
    }
    apply(() => setLocation({ name: `${la.toFixed(3)}, ${ln.toFixed(3)}`, lat: la, lng: ln }));
    toast('Location saved', 'success');
  };

  return (
    <Screen aurora bottomSpace={TAB_BAR_SPACE}>
      <Hero overline="Autopilot" title="Settings" />

      <SectionTitle title="Prayer times" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <MapPin size={18} />
          <Text variant="bodyStrong">{location.name}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {CITIES.map((city) => (
            <Chip
              key={city.name}
              label={city.name}
              selected={city.name === location.name}
              onPress={() => {
                setLat(String(city.lat));
                setLng(String(city.lng));
                apply(() => setLocation(city));
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField label="Latitude" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Longitude" value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <Button label="Use these coordinates" variant="secondary" onPress={saveCoordinates} />
        <Text variant="label" color="textMuted">
          Calculation method
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {(Object.keys(METHODS) as CalcMethod[]).map((m) => (
            <Chip key={m} label={METHODS[m].label} selected={m === method} onPress={() => apply(() => setMethod(m))} />
          ))}
        </View>
        <Text variant="label" color="textMuted">
          Asr
        </Text>
        <SegmentedControl
          options={[
            { value: 'hanafi', label: 'Hanafi' },
            { value: 'standard', label: 'Standard' },
          ]}
          value={school}
          onChange={(s) => apply(() => setSchool(s))}
        />
        {horizon ? (
          <Text variant="caption" color="textFaint">
            Prayer rules are scheduled until {new Date(horizon).toLocaleDateString()}. Opening Autopilot extends this by four months.
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {PRAYERS.map((p) => (
            <View key={p} style={{ minWidth: '30%', gap: 2 }}>
              <Text variant="caption" color="textMuted">
                {PRAYER_LABELS[p]}
              </Text>
              <Text variant="bodyStrong">{today[p] ? today[p]!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle title="Backup and share" />
      <Card style={{ gap: spacing.sm }}>
        <Text variant="caption" color="textMuted">
          Export sends your rules as text you can save or send to another phone. To import, copy that text and tap Import. Imported rules start turned off so you can review them.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Export rules" icon={Share2} variant="secondary" onPress={() => void exportAll()} style={{ flex: 1 }} />
          <Button label="Import" icon={ClipboardPaste} variant="secondary" onPress={() => void importFromClipboard()} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionTitle title="Appearance" />
      <SegmentedControl options={THEMES} value={theme} onChange={setTheme} />

      <SectionTitle title="Updates" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Version {updater.currentVersion}</Text>
          <Text variant="caption" color="textMuted">
            Updates come from this app’s GitHub releases.
          </Text>
        </View>
        <Button label="Check" icon={RefreshCw} variant="secondary" loading={updater.state.phase === 'checking'} onPress={() => void updater.check()} />
      </Card>
      <UpdateCard updater={updater} />

      <Card style={{ paddingVertical: spacing.xs }}>
        <ListItem title="Permissions" subtitle="See what each rule needs" icon={KeyRound} chevron onPress={() => router.push('/permissions')} />
        <ListItem title="Private by design" subtitle="Rules, logs and your location never leave the phone. The only network request is the update check." icon={ShieldCheck} iconTone="success" />
        <ListItem title="Show the introduction again" icon={Sparkles} chevron onPress={() => onboardedSetting.set(false)} />
        <ListItem title="Source code" subtitle="MIT licensed on GitHub" icon={Code} chevron onPress={() => void Linking.openURL(REPO_URL)} />
      </Card>
    </Screen>
  );
}
