<p align="center"><img src="assets/icon.png" width="112" alt="Autopilot logo: an aircraft attitude indicator"></p>

# Autopilot

“When this happens, do that” rules for your Android phone. Silence it for prayer, dim it at bedtime, remind you to unplug at 80%, go quiet when you reach the office. Everything runs on the phone: no account, no server, no tracking.

**[Download the latest APK](https://github.com/muhammadahmad545-code/autopilot/releases/latest)**

Pick the file ending in **`-arm64-v8a.apk`**: that is the right one for almost every phone from the last several years. `-armeabi-v7a.apk` is for older 32-bit phones and `-x86_64.apk` for emulators and Chromebooks. Installed apps update themselves to the matching file.

## What's new in 1.3

- **A real logo:** an aircraft attitude indicator, the instrument an autopilot flies by.
- **Home-screen widget:** shows how many rules are on and what runs next, with a one-tap Pause/Resume.
- **Quick Settings tile:** on while rules run; tap to pause for an hour, tap again to resume.
- **Shortcuts on the app icon:** long-press for *New rule* and *Recipes*.
- **New trigger:** battery saver turns on or off.
- **New action:** say something out loud with the phone's text-to-speech voice.
- **Two new recipes:** *Battery saver helper* and *Say “unplug”*.

## What's new in 1.2

- **Calmer, cleaner design:** plain surfaces, a docked tab bar, clear type and no distracting motion.
- **Pause for a while:** pause every rule for 1 hour, 3 hours or until 7:00 tomorrow; it resumes by itself.
- **Tested end to end on every build:** an Android emulator runs the app like a user before any release.

## What's new in 1.1

- **Redesigned** with tab navigation (Rules, Activity, Recipes, Settings), a status ring, today's prayer times with a countdown, and when each rule last ran.
- **No more silent misses.** Late alarms (doze) run late instead of never; rules missed while the phone was off are logged as missed; rules and alarms are restored before the first unlock after a reboot (direct boot).
- **Battery rules fire once per crossing**, then wait for the level to move 3% back before re-arming.
- **Wi-Fi rules** read the network name from the connection itself and ignore brief drops (45-second debounce).
- **New:** “phone unlocked” trigger, vibrate and auto-rotate actions, three new recipes, duplicate a rule, export and import rules as text.
- **Correct permissions:** ringer and ring-volume changes now ask for Do Not Disturb access, as Android requires; location-services status is checked for Wi-Fi names.

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
| Modify system settings | Brightness and auto-rotate |
| Location | Matching a Wi-Fi network by name (Android treats the name as location) |

Text-to-speech uses the voice already installed on the phone (usually Google's); nothing is sent anywhere.

## Honest limits

- Android may delay alarms in deep sleep; Autopilot runs late rules late (and logs how late) instead of skipping them, and logs rules missed while the phone was off.
- Event rules (charger, battery, battery saver, audio, Wi-Fi, unlock) need the small “Autopilot is on” notification; without unrestricted battery use, some phone makers kill it.
- Android does not let apps turn Wi-Fi, Bluetooth or mobile data on or off, so those are not actions.
- *Say out loud* needs a text-to-speech voice on the phone and plays at the media volume.

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
