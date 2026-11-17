# LavO Gaming Hub

One web-based UI (`www/`), packaged two ways by GitHub Actions:

- **Android**: Capacitor, builds an installable `.apk`
- **Windows**: Tauri v2, builds an installer `.exe` and a portable `.exe`

No framework and no runtime dependencies in the UI. Expected size: Android APK about 4 to 6 MB, Windows app about 5 to 10 MB.

## Build both apps on GitHub

1. Create an empty repository on GitHub.
2. In this folder run:

   ```
   git init
   git add -A
   git commit -m "LavO Gaming Hub"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

   Use git (or GitHub Desktop) rather than drag-and-drop in the browser, because the `.github` folder must be uploaded.
3. Open the **Actions** tab. The workflow **Build LavO Gaming Hub** starts on every push. You can also run it with **Run workflow**.
4. When both jobs are green, open the run and download from **Artifacts**:
   - `LavO-Gaming-Hub-Android-APK` contains `app-debug.apk`
   - `LavO-Gaming-Hub-Windows-Installer` contains the setup `.exe`
   - `LavO-Gaming-Hub-Windows-Portable` contains `lavo-gaming-hub.exe`

## Install

- **Android**: copy the APK to the phone, open it, and allow "install unknown apps" when asked. It is a debug-signed build, so it installs directly.
- **Windows**: run the setup `.exe`. If SmartScreen warns, choose More info, then Run anyway (the app is unsigned).

## Preview in a browser

Open `www/index.html`, or run `npx serve www`. The layout switches between the Windows sidebar (wide screens) and the Android bottom bar (narrow screens).

## Notes

- Data is saved on the device (localStorage). Use Settings > Export backup to move it.
- On Android, "Save file" in export dialogs may not work. Use **Copy** and paste the text where you need it.
- For a Play Store release you need a signed release build with your own keystore. This workflow produces the debug APK only.
- The icon source is `app-icon.png`. The workflow generates every Windows and Android icon from it.

## Games, mods and safety (v1.2)

- **Games**: Windows scans Steam and Epic libraries and detects each game's engine (Source, Unreal, Unity, Godot). Android lists installed apps and shows the store ("Google Play", "APK file", ...).
- **FPS Boost** is forced on for every game by default (Settings can turn it off). On Windows it raises the game's CPU priority for all games and adds engine-specific options: `+fps_max 0 -high -novid` for Source games, `-USEALLAVAILABLECORES -nosplash` for Unreal games. Other engines get the priority boost only. Android does not allow changing other apps, so nothing is boosted there.
- **Mods are Python files**: write a `.py`, rename it to `.la`, import it. They run in a sandbox (`www/pylite.js`): no imports, files, network or system access, step and size limits. Supported Python: variables, numbers, text, f-strings, lists, dicts, `if/elif/else`, `for`, `while`, `def`, `return`, operators, `in`, ternary, and the built-ins `range len int float str bool abs round min max sum sorted print`. Not supported: classes, `try`, `lambda`, comprehensions, slices, imports (only `import lavo` is ignored).
- **Mod API**
  - Info: `name("...")`, `version("1.0.0")`, `author("...")`, `description("...")`, `games("*")` or `games("A", "B")`
  - Settings (declare at the top level): `number(key, label, min, max, default, step)`, `toggle(key, label, default)`, `choice(key, label, [options], default)`. Each returns the value the user picked.
  - Output: `arg("-flag", value)`, `env("NAME", "value")`, `priority("high")`
  - Variables: `game`, `engine`, `platform`, `source`
  - Launch option characters allowed: letters, numbers and `- _ . = : + , / \`. Blocked flags: `+exec`, `-exec`, `+connect`, `-connect`, `+rcon`, `-run`, `-script`, `-cmd`, `-load`, `-dll`, `-inject`, `-preload`.
- **Collections** export as a single `.la` text with `# lavo-collection: Name` and `# ==== mod ====` separators.
- **Safety**: only `.la` files are accepted; every mod is parsed and shown (with its code) before install; launch options are validated again by the Windows side; no shell is used; the priority boost uses a fixed script.
- **Permissions**: no storage permission. Android declares only "see installed apps". Auto-backup is off.
- **Animations**: sliding tab changes, a moving tab indicator, staggered game grids, a launch screen when you press Play, and animated dialogs. They switch off with the device's reduced-motion setting.
