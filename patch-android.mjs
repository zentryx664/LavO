// Run after `tauri android init`. Adds the permissions voice chat needs to the generated manifest.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const path = 'src-tauri/gen/android/app/src/main/AndroidManifest.xml';
if (!existsSync(path)) {
  console.error(`Manifest not found at ${path}. Run "npm run tauri -- android init" first.`);
  process.exit(1);
}

const wanted = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_NETWORK_STATE',
];

let xml = readFileSync(path, 'utf8');
const missing = wanted.filter((p) => !xml.includes(`"${p}"`));
if (missing.length) {
  const lines = missing.map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
  xml = xml.replace(/(\s*)<application/, `\n${lines}\n$1<application`);
  writeFileSync(path, xml);
}
console.log(missing.length ? `Added: ${missing.join(', ')}` : 'Manifest already has all permissions');
