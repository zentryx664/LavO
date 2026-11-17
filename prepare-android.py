from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
android = root / 'android'
manifest = android / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
if not manifest.exists():
    raise SystemExit(f'AndroidManifest.xml not found: {manifest}')

# Install the custom Capacitor bridge into the generated Android project.
java_src = root / 'android-native'
java_dst = android / 'app' / 'src' / 'main' / 'java' / 'com' / 'lavo' / 'gaminghub'
java_dst.mkdir(parents=True, exist_ok=True)
for name in ('MainActivity.java', 'LavoPlugin.java'):
    shutil.copy2(java_src / name, java_dst / name)

text = manifest.read_text(encoding='utf-8')
queries = '''    <queries>
        <intent>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent>
    </queries>
'''
if '<queries>' not in text:
    marker = '<application'
    if marker not in text:
        raise SystemExit('Could not locate <application> in AndroidManifest.xml')
    text = text.replace(marker, queries + '    ' + marker, 1)
manifest.write_text(text, encoding='utf-8')
print('Installed LavO Capacitor plugin and launcher-app visibility query.')
