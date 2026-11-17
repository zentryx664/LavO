// Copies the web app into dist/ (used by CI and for hosting the app as a plain website).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'www'), out, { recursive: true });
console.log('Web app copied to dist/');
