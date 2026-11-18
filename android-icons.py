"""Customise the generated Capacitor Android project.
Run from the repository root AFTER `npx cap add android`.

 - launcher icons from app-icon.png
 - removes the default Capacitor splash screen (solid dark launch background)
 - installs the native LavO plugin (game detection and launching)
 - declares the permissions and the overlay service used for game boost; no storage permission is requested
"""
import os
import re
import sys

from PIL import Image

SRC = "app-icon.png"
ROOT = os.path.join("android", "app", "src", "main")
RES = os.path.join(ROOT, "res")
SIZES = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}

if not os.path.isdir(RES):
    sys.exit('Android project not found. Run "npx cap add android" first.')

# ---- icons ----
src = Image.open(SRC).convert("RGB")
for dens, (legacy, fg) in SIZES.items():
    out = os.path.join(RES, "mipmap-" + dens)
    os.makedirs(out, exist_ok=True)
    icon = src.resize((legacy, legacy), Image.LANCZOS)
    icon.save(os.path.join(out, "ic_launcher.png"))
    icon.save(os.path.join(out, "ic_launcher_round.png"))
    canvas = Image.new("RGBA", (fg, fg), (0, 0, 0, 255))
    inner = int(fg * 0.62)
    logo = src.resize((inner, inner), Image.LANCZOS)
    canvas.paste(logo, ((fg - inner) // 2, (fg - inner) // 2))
    canvas.save(os.path.join(out, "ic_launcher_foreground.png"))

# ---- colours and themes (no default splash screen) ----
values = os.path.join(RES, "values")
os.makedirs(values, exist_ok=True)
head = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
with open(os.path.join(values, "ic_launcher_background.xml"), "w") as f:
    f.write(head + '    <color name="ic_launcher_background">#000000</color>\n</resources>\n')
with open(os.path.join(values, "colors.xml"), "w") as f:
    f.write(head +
            '    <color name="colorPrimary">#131314</color>\n'
            '    <color name="colorPrimaryDark">#0e0e0f</color>\n'
            '    <color name="colorAccent">#f2f2f2</color>\n'
            '    <color name="lavoBackground">#0e0e0f</color>\n</resources>\n')
with open(os.path.join(values, "styles.xml"), "w") as f:
    f.write(head + """    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
        <item name="android:windowBackground">@color/lavoBackground</item>
        <item name="android:statusBarColor">@color/colorPrimaryDark</item>
        <item name="android:navigationBarColor">@color/colorPrimaryDark</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="AppTheme">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
        <item name="android:windowBackground">@color/lavoBackground</item>
    </style>
</resources>
""")

# ---- native plugin ----
main_path = None
for d, _, files in os.walk(os.path.join(ROOT, "java")):
    if "MainActivity.java" in files:
        main_path = os.path.join(d, "MainActivity.java")
        break
if not main_path:
    sys.exit("MainActivity.java not found in the generated project.")
java_dir = os.path.dirname(main_path)
pkg = re.search(r"^package\s+([\w.]+);", open(main_path, encoding="utf-8").read(), re.M).group(1)
for name in sorted(os.listdir("android-native")):
    if not name.endswith(".java"):
        continue
    text = open(os.path.join("android-native", name), encoding="utf-8").read()
    text = re.sub(r"^package\s+[\w.]+;", "package " + pkg + ";", text, count=1, flags=re.M)
    with open(os.path.join(java_dir, name), "w", encoding="utf-8") as f:
        f.write(text)

# ---- manifest: permissions and the overlay service ----
man = os.path.join(ROOT, "AndroidManifest.xml")
t = open(man, encoding="utf-8").read()
PERMS = [
    "QUERY_ALL_PACKAGES",              # see which apps/games are installed
    "WRITE_SETTINGS",                  # brightness, screen timeout, refresh rate (user grants in system settings)
    "ACCESS_NOTIFICATION_POLICY",      # Do Not Disturb (user grants in system settings)
    "SYSTEM_ALERT_WINDOW",             # floating bubble (user grants in system settings)
    "FOREGROUND_SERVICE",
    "FOREGROUND_SERVICE_SPECIAL_USE",  # required for the bubble service on Android 14+
]
lines = ""
for perm in PERMS:
    if "android.permission." + perm + '"' not in t:
        lines += '    <uses-permission android:name="android.permission.' + perm + '" />\n'
if lines:
    t = t.replace("<application", lines + "    <application", 1)
if "OverlayService" not in t:
    service = (
        '        <service\n'
        '            android:name="' + pkg + '.OverlayService"\n'
        '            android:exported="false"\n'
        '            android:foregroundServiceType="specialUse">\n'
        '            <property\n'
        '                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"\n'
        '                android:value="game_overlay_bubble" />\n'
        '        </service>\n'
    )
    t = t.replace("</application>", service + "    </application>", 1)
t = t.replace('android:allowBackup="true"', 'android:allowBackup="false"')
with open(man, "w", encoding="utf-8") as f:
    f.write(t)
print("Android project customised.")
