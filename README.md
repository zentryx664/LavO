# LavO

Lightweight gaming voice and chat for **Android** and **Windows**. One codebase, built with
[Tauri 2](https://tauri.app) (system WebView + a tiny Rust shell, no Flutter, no Electron) and a vanilla JS UI.

| | |
|---|---|
| Accounts, profiles, friends, settings | Supabase Auth + Postgres (the only persistent data) |
| Direct and group text | Supabase Realtime Broadcast, memory only, never stored |
| Voice | WebRTC peer-to-peer, never recorded or stored |
| Online status | Supabase Realtime Presence |

## How it works

- **Friends channel**: each friend pair shares one private Realtime channel (`dm:<idA>:<idB>`) carrying presence, direct messages and call invites. Database policies only let those two users join, and only while they are friends.
- **Rooms** (`room:<CODE>`): temporary group spaces with text and optional voice. Anyone with the code can join. Private calls are rooms with a random 24-character code sent through the friend channel.
- **Voice**: WebRTC mesh with Opus audio, optional noise suppression / echo cancellation / auto gain, microphone and speaker selection, and live ping / jitter / packet-loss readout. Mesh suits small groups (about 6 people).
- **Performance mode**: no animations, lower voice bitrate (24 kbps), slower network polling.
- No performance guarantees are made. LavO is designed to use little CPU and RAM, but results depend on your device and network.

## 1. Set up Supabase (once)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor**: paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. **Authentication > Providers > Email**: for quick testing, turn off "Confirm email". Leave it on for production (users then confirm by email before logging in).
4. **Realtime settings**: make sure "Allow public access" is **off** so private channels are enforced.
5. Copy the Project URL and anon key from **Project Settings > API**.

## 2. Run locally

```bash
npm install
cp .env.example .env     # optional: put your Supabase URL/key here
npm test                 # unit tests
npm run dev              # web preview at http://localhost:1420 (works in Chrome/Edge)
```

If no `.env` is provided, the app asks for the project URL and anon key on first launch and stores them on the device.

Desktop app (needs [Rust](https://rustup.rs) and the Tauri prerequisites for your OS):

```bash
npm run tauri -- dev
npm run tauri -- build --bundles nsis      # Windows installer
```

Android (needs Android Studio / SDK + NDK, Java 17, and `rustup target add aarch64-linux-android`):

```bash
npm run tauri -- android init
node scripts/patch-android.mjs             # adds RECORD_AUDIO etc. to the manifest
npm run tauri -- android build --apk --target aarch64
```

## 3. GitHub: automatic builds

Push this folder to a GitHub repository. [`.github/workflows/build.yml`](.github/workflows/build.yml) then:

1. runs unit tests and a web build,
2. builds the **Windows NSIS installer** (`LavO-windows-installer` artifact),
3. builds and signs the **Android APK** (`LavO-android-apk` artifact, arm64),
4. on a tag like `v0.1.0`, attaches both to a GitHub Release.

Optional repository secrets (**Settings > Secrets and variables > Actions**):

| Secret | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Bake your server into the builds (otherwise users enter it on first launch) |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | TURN relay so voice works behind strict NAT / some mobile networks |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` | Your release signing key. Without it, CI signs with a throwaway key: installable for testing, but updates will not install over it |

Create a keystore once with
`keytool -genkeypair -v -keystore release.keystore -alias lavo -keyalg RSA -keysize 2048 -validity 10000`
and store `base64 -w0 release.keystore` as the secret.

## Project layout

```
src/lib/         pure logic (validation, stats maths, topics), unit-tested
src/services/    auth, friends, settings, audio devices, DirectHub (DMs/presence), Room (chat + WebRTC)
src/views/       gate (setup/login), friends, chat, room, settings, app shell
src-tauri/       minimal Rust shell, Tauri config, icons generated from your logo
supabase/        schema.sql (tables, RLS, RPCs, realtime channel policies)
scripts/         Android manifest patch
```

## Privacy and limits

- Messages and calls are not stored by LavO. Direct messages are only delivered while the friend is online.
- Room codes are shared secrets: anyone who has the code can join that room, and room members can see each other's network addresses via WebRTC.
- Each friend uses one Realtime channel, so very large friend lists (about 100 online-capable friends) hit Supabase's per-connection channel limit.
- Voice mesh sends one stream per participant; larger groups need an SFU, which is out of scope here.

## Honest test status

Verified in development: unit tests for the pure logic, a production web build, a DOM smoke test of every screen, and workflow/config validation.
**Not yet run:** the Rust/Tauri compile, the Android and Windows builds, and real calls on devices. Those happen in GitHub Actions on first push; expect to check the first CI run and test voice on a real phone and PC. The Supabase SQL (especially the Realtime channel policies) was written against the documented API but has not been executed against a live project.
