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
runs=$(grep -o 'text="Battery saver turned on"' "$OUT/e2e-power-save.xml" | wc -l | tr -d ' ')
[ "$runs" = 1 ] && pass "battery saver rule runs once per change" || fail "battery saver rule runs once per change (logged $runs times)"
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

# Appearance: change accent, font, background, depth and navigation; the screen previews the draft,
# Apply uses it everywhere, and it is still there after the app restarts.
# Swatches and font rows are found by their accessibility label (content-desc), not their text.
desc_y() { dump; python3 - "$1" <<'PY'
import re, sys
xml = open('/tmp/ui.xml', encoding='utf-8', errors='ignore').read()
for m in re.finditer(r'<node [^>]*>', xml):
    n = m.group(0)
    if f'content-desc="{sys.argv[1]}"' in n:
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        x1, y1, x2, y2 = map(int, b.groups())
        print((x1 + x2) // 2, (y1 + y2) // 2, 'selected' if ('selected="true"' in n or 'checked="true"' in n) else 'no')
        break
PY
}
# Scroll until the labelled control sits in the upper two thirds of the screen, then tap it.
tap_desc() {
  local last=""
  for i in $(seq 1 12); do
    read -r x y _ <<<"$(desc_y "$1")"
    # Tap once it is in the upper part of the screen, or when scrolling no longer moves it (end of list).
    if [ -n "$y" ] && { { [ "$y" -gt 80 ] && [ "$y" -lt 420 ]; } || [ "$y" = "$last" ]; }; then adb shell input tap $x $y; echo "tapped '$1'"; sleep 1; return 0; fi
    last="$y"
    if [ -n "$y" ] && [ "$y" -le 80 ]; then adb shell input swipe 160 250 160 450 300; else adb shell input swipe 160 450 160 250 300; fi
    sleep 1
  done
  echo "could not reach '$1'"; return 1
}
is_selected_desc() {
  for i in $(seq 1 12); do
    read -r x y state <<<"$(desc_y "$1")"
    if [ -n "$y" ]; then [ "$state" = selected ]; return; fi
    adb shell input swipe 160 450 160 250 300; sleep 1
  done
  return 1
}
adb shell am force-stop $PKG; sleep 1
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 6
tap_text "Settings"; sleep 3
tap_desc "Appearance" || { scroll_to "Appearance" >/dev/null; tap_text "Appearance"; }
sleep 3
expect "your way" 15 "Appearance screen opens with a live preview"
shot e2e-appearance-default
tap_desc "Teal accent"
tap_desc "Manrope font"
tap_desc "Warm background"
tap_desc "Glass"
tap_desc "Floating"
shot e2e-appearance-draft
expect "Apply" 5 "changes wait for Apply"
tap_text "Apply"; sleep 2
expect_not "Discard" 2 "Apply saves the draft"
adb shell input keyevent KEYCODE_BACK; sleep 2
shot e2e-appearance-applied
adb shell am force-stop $PKG; sleep 1
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 6
tap_text "Settings"; sleep 3
tap_desc "Appearance" || { scroll_to "Appearance" >/dev/null; tap_text "Appearance"; }
sleep 3
scroll_top
if is_selected_desc "Teal accent"; then pass "accent choice survives a restart"; else fail "accent choice survives a restart"; fi
if is_selected_desc "Manrope font"; then pass "font choice survives a restart"; else fail "font choice survives a restart"; fi
if is_selected_desc "Floating"; then pass "navigation choice survives a restart"; else fail "navigation choice survives a restart"; fi
# Dark mode with the same choices, for the screenshots.
scroll_top
tap_desc "Dark"; tap_text "Apply"; sleep 2
scroll_top; shot e2e-appearance-dark
tap_desc "Reset to default"; tap_text "Apply"; sleep 2
scroll_top
if is_selected_desc "Autopilot accent"; then pass "Reset to default returns to the app colour"; else fail "Reset to default returns to the app colour"; fi
adb shell input keyevent KEYCODE_BACK; sleep 1
