# Autopilot end-to-end: save a recipe, trigger it with a simulated charger, check the activity
# log, then pause for an hour and resume. Sourced by smoke.sh (helpers come from there).

adb shell dumpsys battery unplug >/dev/null 2>&1
tap_text "Recipes"; sleep 4
expect "Charging confirmation" 6 "recipes list shows"
tap_text "Charging confirmation"; sleep 4
expect "Test now" 15 "rule editor opens from a recipe"
tap_text "Save"; sleep 4
tap_text "Rules"; sleep 4
expect "Charging confirmation" 10 "saved rule appears on the Rules tab"
scroll_top
shot e2e-rule-saved

# Plugging in the charger must fire the rule through the background watcher.
adb shell dumpsys battery set ac 1; sleep 10
tap_text "Activity"; sleep 4
expect "Charger connected" 15 "charger rule ran and was logged"
scroll_top
shot e2e-activity

adb shell dumpsys battery reset >/dev/null 2>&1

# Timed pause and resume.
tap_text "Rules"; sleep 3
scroll_top
tap_text "Pause all rules"; sleep 2
expect "For 1 hour" 10 "pause menu opens"
tap_text "For 1 hour"; sleep 3
expect "Resumes by itself" 10 "timed pause shows when it resumes"
shot e2e-paused
tap_text "Resume all rules"; sleep 3
expect "Running on this phone" 10 "resume brings rules back"

# A broken rule must not save: a reminder with no title.
tap_text "New rule"; sleep 4
tap_text "Show a reminder"; sleep 2
tap_text "Save"; sleep 2
expect "Give the rule a name" 8 "editor rejects an unnamed rule"
adb shell input keyevent KEYCODE_BACK; sleep 2

# Battery saver trigger: save the recipe, switch battery saver on, check the log.
adb shell dumpsys battery unplug >/dev/null 2>&1
tap_text "Recipes"; sleep 4
scroll_to "Battery saver helper" && tap_text "Battery saver helper"; sleep 4
expect "Test now" 15 "battery saver recipe opens"
tap_text "Save"; sleep 4
adb shell settings put global low_power 1; sleep 10
tap_text "Activity"; sleep 4
expect "Battery saver turned on" 15 "battery saver rule ran and was logged"
shot e2e-power-save
adb shell settings put global low_power 0
adb shell dumpsys battery reset >/dev/null 2>&1

# Launcher shortcuts and the home-screen widget are registered.
adb shell dumpsys shortcut > "$OUT/shortcuts.txt" 2>/dev/null
grep -A40 "Package: dev.basalt.autopilot" "$OUT/shortcuts.txt" | grep -q "id=new-rule" && pass "launcher shortcuts installed" || fail "launcher shortcuts installed"
adb shell dumpsys appwidget > "$OUT/appwidget.txt" 2>/dev/null
grep -q "dev.basalt.autopilot/expo.modules.autopilotengine.StatusWidget" "$OUT/appwidget.txt" && pass "home-screen widget is offered" || fail "home-screen widget is offered"

# Quick Settings tile pauses for an hour, and a second tap resumes.
TILE=dev.basalt.autopilot/expo.modules.autopilotengine.PauseTileService
adb shell cmd statusbar add-tile $TILE >/dev/null 2>&1
adb shell cmd statusbar click-tile $TILE >/dev/null 2>&1; sleep 3
adb shell cmd statusbar collapse >/dev/null 2>&1
adb shell monkey -p dev.basalt.autopilot -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 4
tap_text "Rules"; sleep 3
scroll_top
expect "Resumes by itself" 10 "Quick Settings tile pauses rules for an hour"
shot e2e-tile-paused
adb shell cmd statusbar click-tile $TILE >/dev/null 2>&1; sleep 3
adb shell cmd statusbar collapse >/dev/null 2>&1
adb shell monkey -p dev.basalt.autopilot -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 4
expect "Running on this phone" 10 "a second tap on the tile resumes"
