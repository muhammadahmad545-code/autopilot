# Autopilot

“When this happens, do that” rules for your Android phone. Silence it for prayer, dim it at bedtime, remind you to unplug at 80%, go quiet when you reach the office. Everything runs on the phone: no account, no server, no tracking.

**[Download the latest APK](https://github.com/muhammadahmad545-code/autopilot/releases/latest)**

## What it does

| Triggers | Actions |
|---|---|
| Time of day, on chosen weekdays | Ringer: ring, vibrate or silent |
| Prayer times, with an offset (calculated offline) | Do Not Disturb on or off |
| Charger plugged in or unplugged | Media and ring volume |
| Battery drops below or reaches a level | Screen brightness |
| Headphones connect or disconnect (wired, USB, Bluetooth) | Flashlight on or off |
| Joining or leaving Wi-Fi, any network or by name | Reminder notification |

- **Conditions** on any rule: only on certain days, only between certain hours (windows may cross midnight).
- **Recipes** for common setups, ready to adjust.
- **Test now** runs a rule's actions immediately so you can check it before relying on it.
- **Activity log** shows every run, what caused it, and exactly which action failed and why.
- **Permission health**: each rule declares what it needs, and the app tells you what is missing instead of failing silently.
- **Self-updating** from this repository's releases.

## How it works

The rules engine is native Kotlin and does not depend on the React Native side being alive:

```
Rules (JSON)  ──setRules──▶  Engine (SharedPreferences)
                               ├─ AlarmManager ── exact alarm for the next time/prayer rule
                               ├─ WatchService ── foreground service; charger, battery,
                               │                  headphone and Wi-Fi listeners
                               └─ BootReceiver ── re-arms after reboot, update or time-zone change
```

- **Clock rules** compute their next occurrence in the device's local time and arm one exact alarm for the earliest rule. When it fires, every rule due in that window runs once (tracked per rule, so a late alarm never runs a rule twice) and the next alarm is armed.
- **Event rules** need a foreground service, because Android no longer delivers charger, battery or connectivity broadcasts to background apps. The service only runs while an enabled rule needs it, and stops itself otherwise.
- **Battery rules** fire on the crossing, not the level: “below 20%” fires once when the level goes from 20 to 19, not on every update after that.
- **Prayer times** are calculated on the phone with the standard astronomical method (sun declination and equation of time), with five calculation methods and Hanafi or standard Asr. The next 120 days are precomputed and refreshed each time the app opens.

## Built with

- React Native 0.88 + Expo SDK 58, TypeScript, Expo Router
- Kotlin Expo module for the engine, alarms, receivers and foreground service
- [Basalt Core](https://github.com/muhammadahmad545-code/basalt-core) for the shared theme, UI kit, settings and updater
- Tests for prayer-time accuracy against published Lahore timetables, rule descriptions, permission requirements and validation of every recipe

## Permissions

Each is requested only when a rule needs it.

| Permission | Used for |
|---|---|
| Notifications | Reminder actions and the required “Autopilot is on” notice |
| Alarms & reminders | Running time and prayer rules on the exact minute |
| Unrestricted battery | Keeping event rules alive in the background |
| Do Not Disturb access | Do Not Disturb and fully silent mode |
| Modify system settings | Brightness |
| Location | Matching a Wi-Fi network by name (Android treats the name as location) |

Installed from outside the Play Store on Android 13 or later? Android may block some of these as “restricted settings”. Open App info, tap ⋮, choose **Allow restricted settings**, then try again.

## Development

```bash
npm install
npm test
npm run typecheck
npm run prebuild
npx expo run:android
```

Pushing a tag `vX.Y.Z` that matches `package.json` builds a signed APK in GitHub Actions and publishes it as a release.

## License

MIT
