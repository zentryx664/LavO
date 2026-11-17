// Dependency-free sanity checks: files exist, JSON/JS parse, and the Python mod engine works.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
let bad = 0;
const ok = m => console.log('ok   ' + m);
const fail = m => { console.error('FAIL ' + m); bad++; };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

['www/index.html', 'www/app.js', 'www/pylite.js', 'www/styles.css', 'www/logo.png', 'app-icon.png', 'capacitor.config.json',
  'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/src/main.rs', 'src-tauri/build.rs', 'src-tauri/capabilities/default.json',
  'android-native/LavoPlugin.java', 'android-native/MainActivity.java', 'scripts/android-icons.py']
  .forEach(f => fs.existsSync(path.join(root, f)) ? ok('found ' + f) : fail('missing ' + f));

['package.json', 'capacitor.config.json', 'src-tauri/tauri.conf.json', 'src-tauri/capabilities/default.json']
  .forEach(f => { try { JSON.parse(read(f)); ok('valid JSON ' + f); } catch (e) { fail('invalid JSON ' + f + ': ' + e.message); } });

['www/app.js', 'www/pylite.js'].forEach(f => { try { new vm.Script(read(f), { filename: f }); ok('parses ' + f); } catch (e) { fail('syntax error in ' + f + ': ' + e.message); } });

const html = read('www/index.html');
['styles.css', 'pylite.js', 'app.js', 'logo.png'].forEach(f => html.includes(f) ? ok('index.html uses ' + f) : fail('index.html does not reference ' + f));

try {
  const P = require(path.join(root, 'www', 'pylite.js'));
  const code = 'name("T")\nfps = number("fps", "FPS", 0, 1000, 0, 10)\nif engine == "source":\n    arg("+fps_max", fps)\npriority("high")\n';
  const r = P.run(code, { engine: 'source', values: { fps: 144 } });
  r.args.join(' ') === '+fps_max 144' && r.priority === 'high' && r.settings.length === 1 ? ok('Python mod engine runs a mod') : fail('Python mod engine returned ' + JSON.stringify(r));
  ['import os', 'open("x")', 'arg("&calc")', 'arg("+exec", "x")', 'env("PATH", "x")', 'while True:\n    pass']
    .forEach(s => { try { P.run('name("T")\n' + s, {}); fail('sandbox allowed: ' + s); } catch (e) { e instanceof P.PyError ? ok('sandbox blocks: ' + s.split('\n')[0]) : fail('unexpected error for ' + s); } });
} catch (e) { fail('Python mod engine: ' + e.message); }

if (bad) { console.error('\n' + bad + ' check(s) failed'); process.exit(1); }
console.log('\nAll checks passed');
