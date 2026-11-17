(function () {
'use strict';

/* ---------- helpers ---------- */
const KEY = 'lavo.v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATS = ['Action', 'Adventure', 'Strategy', 'Racing', 'Sports', 'Puzzle', 'RPG', 'Shooter', 'Simulation', 'Other'];
const PAGES = ['home', 'library', 'tournaments', 'leaderboards', 'mods', 'profile', 'settings'];
const NAV = [['home', 'Home'], ['library', 'Library'], ['tournaments', 'Tournaments'], ['leaderboards', 'Leaderboards'], ['mods', 'Mods'], ['profile', 'Profile']];
const BOTTOM = [['home', 'Home'], ['library', 'Library'], ['tournaments', 'Tournaments'], ['leaderboards', 'Ranks'], ['mods', 'Mods']];
const IC = {
  home: 'M3 11l9-8 9 8v10H3z',
  library: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  tournaments: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 20h8',
  leaderboards: 'M5 20V10M12 20V4M19 20v-7',
  mods: 'M12 3l9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6L6 18',
  back: 'M15 6l-6 6 6 6',
  play: 'M7 4l13 8-13 8z',
  scan: 'M4 12a8 8 0 0 1 14-5M20 4v4h-4M20 12a8 8 0 0 1-14 5M4 20v-4h4'
};
const ic = (n, s = 20) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[n]}"/></svg>`;

/* ---------- native bridge (Windows: Tauri, Android: Capacitor plugin) ---------- */
const tauriCore = () => (window.__TAURI__ && window.__TAURI__.core) || null;
let _lavo;
function lavoPlugin() {
  if (_lavo === undefined) {
    const c = window.Capacitor;
    _lavo = c && c.isNativePlatform && c.isNativePlatform() && c.registerPlugin ? c.registerPlugin('Lavo') : null;
  }
  return _lavo;
}
const platform = () => tauriCore() ? 'windows' : lavoPlugin() ? 'android' : 'web';
const STORES = {
  'com.android.vending': 'Google Play', 'com.amazon.venezia': 'Amazon Appstore', 'com.sec.android.app.samsungapps': 'Galaxy Store',
  'com.xiaomi.mipicks': 'Xiaomi GetApps', 'com.xiaomi.market': 'Xiaomi GetApps', 'com.huawei.appmarket': 'AppGallery',
  'com.heytap.market': 'OPPO App Market', 'com.oppo.market': 'OPPO App Market', 'com.bbk.appstore': 'vivo App Store',
  'org.fdroid.fdroid': 'F-Droid', 'com.aurora.store': 'Aurora Store'
};
const SIDELOAD = ['', 'com.android.packageinstaller', 'com.google.android.packageinstaller', 'com.miui.packageinstaller', 'com.android.shell', 'com.samsung.android.packageinstaller'];
const storeName = p => p == null || SIDELOAD.indexOf(p) >= 0 ? 'APK file' : (STORES[p] || 'Other store');

/* ---------- mods: Python (.la) runtime, safety and built-ins ---------- */
const PL = window.PyLite;
const SAFE = /^[A-Za-z0-9_\-.=:+,\/\\]*$/;
const BAD_FLAG = ['+exec', '-exec', '+connect', '-connect', '+rcon', '-run', '-script', '-cmd', '-load', '-dll', '-inject', '-preload'];
const blockedFlag = a => BAD_FLAG.indexOf(String(a).split('=')[0].toLowerCase()) >= 0;
const clampNum = PL.clampNum;
const slug = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const BUILTIN_CODE = [
`name("FPS Boost")
version("1.1.0")
author("LavO")
description("Forces supported games to run faster: no frame cap, high CPU priority and quicker startup. Engine-aware.")
games("*")

fps = number("fps", "FPS limit (0 = unlimited)", 0, 1000, 0, 10)
high = toggle("high", "High CPU priority", True)
cores = toggle("cores", "Use all CPU cores (Unreal)", True)
skip = toggle("skip", "Skip intro videos", True)

if high:
    priority("high")
if engine == "source":
    arg("+fps_max", fps)
    if high:
        arg("-high")
    if skip:
        arg("-novid")
elif engine == "unreal":
    if cores:
        arg("-USEALLAVAILABLECORES")
    if skip:
        arg("-nosplash")
`,
`name("Sensitivity")
version("1.1.0")
author("LavO")
description("Sets mouse sensitivity at launch in Source-engine games. Edit the code to support more games.")
games("*")

sens = number("sens", "Mouse sensitivity", 0.1, 10, 1.5, 0.1)

if engine == "source":
    arg("+sensitivity", sens)
`,
`name("Windowed Mode")
version("1.1.0")
author("LavO")
description("Starts the game in a window, optionally without borders.")
games("*")

borderless = toggle("borderless", "Borderless window", False)

if engine == "unity":
    arg("-screen-fullscreen", 0)
    if borderless:
        arg("-popupwindow")
elif engine in ["source", "unreal"]:
    arg("-windowed")
    if borderless:
        arg("-noborder")
`,
`name("Skip Intros")
version("1.1.0")
author("LavO")
description("Skips intro videos and splash screens in Source and Unreal games.")
games("*")

if engine == "source":
    arg("-novid")
elif engine == "unreal":
    arg("-nosplash")
`,
`name("Developer Console")
version("1.1.0")
author("LavO")
description("Enables the in-game console in Source-engine games.")
games("*")

if engine == "source":
    arg("-console")
`,
`name("Language Override")
version("1.1.0")
author("LavO")
description("Launches Source-engine games in the language you choose.")
games("*")

lang = choice("lang", "Language", ["english", "french", "german", "spanish", "russian", "schinese", "japanese"], "english")

if engine == "source":
    arg("-language", lang)
`
];
const MOD_TEMPLATE = `# LavO mod, written in Python. Share it as a .la file.
name("My Mod")
version("1.0.0")
author("me")
description("What this mod does")
games("*")          # or games("Game A", "Game B")

# Settings: declare them at the top level of the file.
fps = number("fps", "FPS limit", 30, 360, 144)
quiet = toggle("quiet", "Skip intro", True)

# engine is "source", "unreal", "unity", "godot" or "unknown".
if engine == "source":
    arg("+fps_max", fps)
    if quiet:
        arg("-novid")
priority("high")
`;
function ctxFor(g, values) { return { values: values || {}, game: g ? g.name : '', engine: g ? (g.engine || (g.kind === 'android' ? 'android' : 'unknown')) : 'unknown', platform: platform(), source: g ? (g.source || '') : '' }; }
function declare(code) {
  try {
    const r = PL.run(code, ctxFor(null, {})), m = r.meta, id = slug(m.name);
    if (!id) return { error: 'The mod name needs letters or numbers.' };
    return { mod: { id, name: m.name, version: m.version, author: m.author, description: m.description, games: m.games, settings: r.settings, code } };
  } catch (e) { return { error: e instanceof PL.PyError ? e.message : 'Could not read this mod.' }; }
}
const modOpts = (m, g) => { const r = PL.run(m.code, ctxFor(g, m.values)); return { args: r.args, env: r.env, priority: r.priority }; };
const appliesTo = (m, g) => m.games.indexOf('*') >= 0 || m.games.some(n => n.toLowerCase() === g.name.toLowerCase());
const modOnFor = (m, g) => (m.id === 'fps-boost' && S.settings.boostAll) ? true : (g.mods && g.mods[m.id] !== undefined ? !!g.mods[m.id] : !!m.enabled);
const canMod = g => ['steam', 'epic', 'exe'].indexOf(g.kind) >= 0;
function launchSpec(g) {
  const args = [], env = {}, errors = []; let n = 0, pri = '';
  if (canMod(g)) S.mods.filter(m => appliesTo(m, g) && modOnFor(m, g)).forEach(m => {
    try {
      const o = modOpts(m, g); n++;
      o.args.forEach(a => { if (args.length < 32 && a && SAFE.test(a) && !blockedFlag(a)) args.push(a); });
      Object.keys(o.env).forEach(k => { if (SAFE.test(o.env[k])) env[k] = o.env[k]; });
      if (o.priority === 'high' || (o.priority === 'above_normal' && pri !== 'high')) pri = o.priority;
    } catch (e) { errors.push(m.name + ': ' + (e && e.message ? e.message : 'failed')); }
  });
  return { args, env, n, priority: pri, errors };
}

/* ---------- state ---------- */
const defaults = () => ({
  games: [], recent: [], tournaments: [], mods: [], collections: [], session: null,
  profile: { name: 'Player', tag: '' },
  settings: { compact: false, lazy: true, start: 'home', autoscan: true, boostAll: true, boostInit: false }
});
function normalize(r) {
  const o = Object.assign(defaults(), r && typeof r === 'object' ? r : {});
  o.profile = Object.assign(defaults().profile, o.profile);
  o.settings = Object.assign(defaults().settings, o.settings);
  ['games', 'recent', 'tournaments', 'mods', 'collections'].forEach(k => { if (!Array.isArray(o[k])) o[k] = []; });
  o.games.forEach(g => { if (!g.kind) g.kind = 'manual'; if (g.source == null) g.source = ''; });
  o.mods = o.mods.filter(m => m && typeof m.id === 'string' && typeof m.code === 'string' && Array.isArray(m.settings) && Array.isArray(m.games));
  BUILTIN_CODE.forEach(code => {
    const d = declare(code); if (!d.mod) return;
    const b = d.mod, ex = o.mods.find(m => m.id === b.id);
    if (ex) Object.assign(ex, { name: b.name, version: b.version, author: b.author, description: b.description, settings: b.settings, code: b.code, builtin: true, source: 'builtin' });
    else o.mods.push(Object.assign({}, b, { enabled: b.id === 'fps-boost', builtin: true, source: 'builtin', values: {}, history: [] }));
  });
  if (!o.settings.boostInit) { o.settings.boostInit = true; const f = o.mods.find(m => m.id === 'fps-boost'); if (f) f.enabled = true; }
  const ids = o.mods.map(m => m.id);
  o.collections.forEach(c => { c.mods = (c.mods || []).filter(i => ids.indexOf(i) >= 0); });
  return o;
}
function load() { try { return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return normalize(null); } }
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save: storage is full'); } };
const ui = { q: '', cat: 'All', sort: 'name', org: false, sel: new Set(), lb: 'global', lbT: '', modCol: 'all', modTab: 'mods' };
const gameById = id => S.games.find(g => g.id === id);
const catOpts = sel => CATS.map(c => `<option${c === sel ? ' selected' : ''}>${c}</option>`).join('');
const fmtTime = m => { m = Math.round(m || 0); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`; };
const art = g => g.art ? `<img src="${esc(g.art)}" alt="" ${S.settings.lazy ? 'loading="lazy" ' : ''}decoding="async">` : esc((g.name.trim()[0] || '?').toUpperCase());
const sub = g => esc(g.category) + (g.source ? ' · ' + esc(g.source) : '');
const markRecent = id => { S.recent = [id].concat(S.recent.filter(x => x !== id)).slice(0, 12); };
const cmpVer = (a, b) => {
  const x = String(a).split(/[.\-]/).map(n => parseInt(n, 10) || 0), y = String(b).split(/[.\-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
};

/* ---------- tournaments ---------- */
function seedOrder(n) { let o = [1]; while (o.length < n) { const m = o.length * 2; o = o.flatMap(s => [s, m + 1 - s]); } return o; }
function blank() { return { a: null, b: null, sa: null, sb: null, w: null }; }
function propagate(t) {
  const R = t.rounds;
  R[0].forEach(m => { if (m.a && !m.b) m.w = m.a; else if (!m.a && m.b) m.w = m.b; });
  for (let r = 1; r < R.length; r++) {
    R[r].forEach((m, j) => {
      const a = R[r - 1][2 * j].w, b = R[r - 1][2 * j + 1].w;
      if (m.a !== a || m.b !== b) { m.a = a; m.b = b; m.w = null; m.sa = null; m.sb = null; }
    });
  }
  const f = R[R.length - 1][0];
  t.champion = f.w || null;
  t.status = f.w ? 'Completed' : 'In progress';
}
function build(t) {
  const ps = t.players.slice(); let size = 2; while (size < ps.length) size *= 2;
  const o = seedOrder(size), r0 = [];
  for (let i = 0; i < size; i += 2) { const m = blank(); m.a = ps[o[i] - 1] || null; m.b = ps[o[i + 1] - 1] || null; r0.push(m); }
  const rounds = [r0]; let c = r0.length;
  while (c > 1) { c /= 2; rounds.push(Array.from({ length: c }, blank)); }
  t.rounds = rounds; propagate(t);
}
function setRes(t, r, j, sa, sb) { const m = t.rounds[r][j]; m.sa = sa; m.sb = sb; m.w = sa > sb ? m.a : m.b; propagate(t); }
function roundName(r, n) { const k = n - 1 - r; return k === 0 ? 'Final' : k === 1 ? 'Semifinals' : k === 2 ? 'Quarterfinals' : 'Round ' + (r + 1); }
function stats(ts) {
  const m = new Map();
  const get = n => { if (!m.has(n)) m.set(n, { name: n, played: 0, wins: 0, losses: 0, titles: 0 }); return m.get(n); };
  ts.forEach(t => {
    t.players.forEach(get);
    if (!t.rounds) return;
    t.rounds.forEach(rd => rd.forEach(x => {
      if (x.a && x.b && x.w) { const l = x.w === x.a ? x.b : x.a; get(x.w).wins++; get(x.w).played++; get(l).losses++; get(l).played++; }
    }));
    const f = t.rounds[t.rounds.length - 1][0];
    if (f && f.w) get(f.w).titles++;
  });
  return Array.from(m.values()).map(p => Object.assign(p, { pts: p.wins * 3 + p.titles * 5, rate: p.played ? Math.round(100 * p.wins / p.played) : 0 }))
    .sort((a, b) => b.pts - a.pts || b.rate - a.rate || b.wins - a.wins || a.name.localeCompare(b.name));
}

/* ---------- views ---------- */
function vHome() {
  const total = S.games.reduce((a, g) => a + (g.minutes || 0), 0);
  const rec = S.recent.map(gameById).filter(Boolean).slice(0, 6);
  const q = [['library', 'Game Library', 'Browse and organize'], ['tournaments', 'Tournaments', 'Create and manage'], ['leaderboards', 'Leaderboards', 'Rankings and stats'], ['mods', 'Mods', 'Collections and versions']];
  const st = [['Total Games', S.games.length], ['Tournaments', S.tournaments.length], ['Total Playtime', fmtTime(total)]];
  return `<div class="ph"><div><h1>Welcome back, ${esc(S.profile.name)}</h1><p class="mu">Pick up where you left off.</p></div></div>
<div class="g4">${q.map(x => `<a class="card qc" href="#/${x[0]}">${ic(x[0], 22)}<h2>${x[1]}</h2><span class="mu">${x[2]}</span></a>`).join('')}</div>
<section><h2 class="sh">Recently Played</h2><div class="rec">${rec.map((g, i) => `<button class="gt" style="--i:${i}" data-act="game" data-id="${g.id}"><span class="gi">${art(g)}</span><span class="gn">${esc(g.name)}</span></button>`).join('')}</div>${S.games.length ? '' : '<p class="mu sm" style="margin-top:14px">No installed games detected yet. Games will appear here automatically when available.</p>'}</section>
<section><h2 class="sh">Your Stats</h2><div class="g3">${st.map(x => `<div class="card stat"><div class="mu">${x[0]}</div><div class="v">${esc(x[1])}</div></div>`).join('')}</div></section>`;
}

function libList() {
  const q = ui.q.trim().toLowerCase();
  const l = S.games.filter(g => (ui.cat === 'All' || g.category === ui.cat) && (g.name + ' ' + g.source).toLowerCase().includes(q));
  const s = {
    name: (a, b) => a.name.localeCompare(b.name),
    category: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    added: (a, b) => b.added - a.added
  }[ui.sort] || ((a, b) => a.name.localeCompare(b.name));
  return l.sort(s);
}
function libGrid() {
  const l = libList();
  if (!l.length) return `<p class="mu empty">${S.games.length ? 'No games match your search.' : 'No installed games detected. LavO will list supported games automatically.'}</p>`;
  return `<div class="grid">${l.map((g, i) => {
    const on = ui.sel.has(g.id);
    return `<button class="card gc${on ? ' on' : ''}" style="--i:${Math.min(i, 16)}" data-act="${ui.org ? 'sel' : 'game'}" data-id="${g.id}"${ui.org ? ` aria-pressed="${on}"` : ''}><span class="gi big">${art(g)}</span><span class="gn">${esc(g.name)}</span><span class="mu sm">${sub(g)}</span>${ui.org ? `<span class="ck">${on ? ic('check', 14) : ''}</span>` : ''}</button>`;
  }).join('')}</div>`;
}
function orgbar() {
  if (!ui.org) return '';
  return `<div class="card orgbar"><span>${ui.sel.size} selected</span><button class="btn" data-act="sel-all">Select all</button><select id="orgcat" aria-label="Category">${catOpts('')}</select><button class="btn" data-act="sel-cat">Set category</button><button class="btn" data-act="sel-remove">Remove</button></div>`;
}
function refreshLib() { const g = $('#libGrid'); if (!g) return; g.innerHTML = libGrid(); const o = $('#orgbar'); if (o) o.innerHTML = orgbar(); }
function vLibrary() {
  if (ui.cat !== 'All' && !S.games.some(g => g.category === ui.cat)) ui.cat = 'All';
  const cats = ['All'].concat(Array.from(new Set(S.games.map(g => g.category))).sort());
  return `<div class="ph"><h1>Library</h1><div class="acts"><button class="btn" data-act="organize">${ui.org ? 'Done' : 'Organize'}</button></div></div>
<div class="bar"><input class="srch" type="search" data-bind="q" placeholder="Search installed games" aria-label="Search games" value="${esc(ui.q)}"></div>
<div class="chips">${cats.map(c => `<button class="ch${ui.cat === c ? ' on' : ''}" data-act="cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
<div id="orgbar">${orgbar()}</div><div id="libGrid">${libGrid()}</div>`;
}

const pillCls = s => s === 'In progress' ? 'a' : s === 'Completed' ? 'b' : '';
function vTournaments() {
  const l = S.tournaments.slice().sort((a, b) => b.created - a.created);
  return `<div class="ph"><h1>Tournaments</h1><div class="acts"><button class="btn p" data-act="new-t">${ic('plus', 16)} Create tournament</button></div></div>
${l.length ? `<div class="list">${l.map(t => `<a class="card row-link" href="#/tournaments/${t.id}"><div class="grow"><h2>${esc(t.name)}</h2><span class="mu sm">${esc(t.game || 'No game')} · Single elimination</span></div><span class="mu sm">${t.players.length} participants</span><span class="pill ${pillCls(t.status)}">${t.status}</span></a>`).join('')}</div>` : '<p class="mu empty">No tournaments yet. Create one to register participants, run a bracket and record results.</p>'}`;
}
function matchHtml(t, r, j) {
  const m = t.rounds[r][j];
  const slot = (p, s) => {
    const w = m.w && p && m.w === p, l = m.w && p && m.w !== p;
    return `<span class="slot${w ? ' w' : ''}${l ? ' l' : ''}"><span>${p ? esc(p) : (r === 0 ? 'Bye' : 'TBD')}</span><span>${s == null ? '' : s}</span></span>`;
  };
  const inner = slot(m.a, m.sa) + slot(m.b, m.sb);
  return m.a && m.b ? `<button class="match" data-act="match" data-r="${r}" data-j="${j}" aria-label="Enter result for ${esc(m.a)} versus ${esc(m.b)}">${inner}</button>` : `<div class="match">${inner}</div>`;
}
function vTournament(id) {
  const t = S.tournaments.find(x => x.id === id);
  if (!t) return '<div class="ph"><h1>Tournament not found</h1></div><div><a class="btn" href="#/tournaments">Back to tournaments</a></div>';
  const open = t.status === 'Open';
  const acts = (open ? `<button class="btn p" data-act="t-start"${t.players.length < 2 ? ' disabled' : ''}>Start tournament</button>` : '<button class="btn" data-act="t-board">Standings</button><button class="btn" data-act="t-reset">Reset bracket</button>') + '<button class="btn" data-act="t-delete">Delete</button>';
  let body;
  if (open) {
    body = `<div class="card stack"><h2>Participants and teams</h2>
<form id="addp" class="inline"><input name="pname" placeholder="Participant or team name" aria-label="Participant or team name" maxlength="40" required><button class="btn p">Register</button></form>
${t.players.length ? `<ul class="plist">${t.players.map((p, i) => `<li><span>${i + 1}. ${esc(p)}</span><button class="ib" data-act="t-rm" data-n="${esc(p)}" aria-label="Remove ${esc(p)}">${ic('x', 16)}</button></li>`).join('')}</ul>` : '<p class="mu">No participants yet.</p>'}
<p class="mu sm">Add at least 2 participants to start. Seeding follows registration order.</p></div>`;
  } else {
    const n = t.rounds.length;
    body = `${t.champion ? `<div class="card champ">${ic('tournaments', 20)}<span>Champion: <strong>${esc(t.champion)}</strong></span></div>` : ''}
<div class="bracket">${t.rounds.map((rd, r) => `<div class="round"><h3>${roundName(r, n)}</h3>${rd.map((_, j) => matchHtml(t, r, j)).join('')}</div>`).join('')}</div>
<p class="mu sm">Select a match to enter or change its result.</p>`;
  }
  return `<a class="back" href="#/tournaments">${ic('back', 16)} Tournaments</a>
<div class="ph"><div><h1>${esc(t.name)}</h1><p class="mu">${esc(t.game || 'No game')} · Single elimination · ${t.players.length} participants</p></div><div class="acts"><span class="pill ${pillCls(t.status)}">${t.status}</span>${acts}</div></div>${body}`;
}

function vLeaders() {
  if (!S.tournaments.some(t => t.id === ui.lbT)) ui.lbT = S.tournaments.length ? S.tournaments[0].id : '';
  const scope = ui.lb === 'global' ? S.tournaments : S.tournaments.filter(t => t.id === ui.lbT);
  const rows = stats(scope);
  return `<div class="ph"><h1>Leaderboards</h1><div class="chips"><button class="ch${ui.lb === 'global' ? ' on' : ''}" data-act="lb-tab" data-v="global">Global</button><button class="ch${ui.lb === 't' ? ' on' : ''}" data-act="lb-tab" data-v="t">Tournament</button></div></div>
${ui.lb === 't' && S.tournaments.length ? `<div class="bar"><select class="sel" data-bind="lbT" aria-label="Tournament">${S.tournaments.map(t => `<option value="${t.id}"${t.id === ui.lbT ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>` : ''}
${rows.length ? `<div class="card tw"><table><thead><tr><th>#</th><th>Player</th><th class="hm">Played</th><th>Wins</th><th>Win rate</th><th>Points</th></tr></thead><tbody>${rows.map((p, i) => `<tr><td>${i + 1}</td><td><button class="lnk" data-act="lb-player" data-n="${esc(p.name)}">${esc(p.name)}</button></td><td class="hm">${p.played}</td><td>${p.wins}</td><td>${p.rate}%</td><td>${p.pts}</td></tr>`).join('')}</tbody></table></div><p class="mu sm">3 points per match win, 5 for a tournament title.</p>` : '<p class="mu empty">Rankings appear once tournaments have participants and results.</p>'}`;
}

const modGames = m => m.games.indexOf('*') >= 0 ? 'All games' : m.games.join(', ');
function modCompatibility(m, g) {
  if (g.kind === 'android') return { label: 'Unsupported on Android', detail: 'Android does not allow LavO to apply these launch mods to another app.', tone: 'warn' };
  if (!canMod(g)) return { label: 'Unsupported platform', detail: 'This game source cannot receive LavO launch options.', tone: 'warn' };
  if (!appliesTo(m, g)) return { label: 'Not targeted', detail: 'This mod does not list this game in its supported game names.', tone: 'muted' };
  const engines = Array.from(m.code.matchAll(/engine\s*==\s*["']([^"']+)["']/g)).map(x => x[1].toLowerCase());
  const unique = Array.from(new Set(engines));
  if (unique.length && (!g.engine || g.engine === 'unknown')) return { label: 'Needs review', detail: 'The mod checks for ' + unique.join(' / ') + ' engine support, but this game engine is unknown.', tone: 'warn' };
  if (unique.length && unique.indexOf(String(g.engine).toLowerCase()) < 0) return { label: 'Engine mismatch', detail: 'This mod contains engine-specific settings for ' + unique.join(' / ') + ', while this game is detected as ' + g.engine + '.', tone: 'warn' };
  return { label: 'Compatible', detail: unique.length ? 'Game target and detected engine match this mod.' : 'Game target matches. No engine-specific requirement was detected.', tone: 'good' };
}
function vModCompatibility() {
  if (!S.mods.length) return '<p class="mu empty">No mods are installed to check yet.</p>';
  if (!S.games.length) return '<p class="mu empty">No installed games detected. Compatibility results will appear when LavO finds games on this device.</p>';
  return `<div class="compat-list">${S.mods.map(m => {
    const rows = S.games.map(g => ({ game: g, result: modCompatibility(m, g) }));
    const supported = rows.filter(x => x.result.label === 'Compatible').length;
    return `<section class="card compat-card"><div class="compat-head"><div><h2>${esc(m.name)}</h2><p class="mu sm">v${esc(m.version)} · ${esc(modGames(m))}</p></div><span class="pill">${supported} compatible</span></div><div class="compat-rows">${rows.map(x => `<div class="compat-row"><span class="compat-game"><span class="gi mini">${art(x.game)}</span><span>${esc(x.game.name)}<small class="mu">${esc(x.game.engine || 'Engine unknown')} · ${esc(x.game.kind)}</small></span></span><span class="compat-status ${x.result.tone}"><b>${esc(x.result.label)}</b><small>${esc(x.result.detail)}</small></span></div>`).join('')}</div></section>`;
  }).join('')}</div>`;
}
function vMods() {
  if (ui.modCol !== 'all' && !S.collections.some(c => c.id === ui.modCol)) ui.modCol = 'all';
  const col = S.collections.find(c => c.id === ui.modCol);
  const list = col ? S.mods.filter(m => col.mods.indexOf(m.id) >= 0) : S.mods;
  const tabs = `<div class="chips mod-tabs"><button class="ch${ui.modTab === 'mods' ? ' on' : ''}" data-act="mod-tab" data-v="mods">Installed mods</button><button class="ch${ui.modTab === 'compat' ? ' on' : ''}" data-act="mod-tab" data-v="compat">Compatibility</button></div>`;
  if (ui.modTab === 'compat') return `<div class="ph"><h1>Mod Compatibility</h1></div>${tabs}<p class="mu sm">Checks each mod against detected games, platform support, game targeting and known engine requirements. Results are advisory; LavO cannot verify every mod's behavior inside a game.</p>${vModCompatibility()}`;
  const side = `<aside class="card mod-collections"><h2>Collections</h2><button class="mod-collection${col ? '' : ' on'}" data-act="col" data-id="all">All mods <span class="cnt">${S.mods.length}</span></button>${S.collections.map(c => `<button class="mod-collection${col && col.id === c.id ? ' on' : ''}" data-act="col" data-id="${c.id}">${esc(c.name)} <span class="cnt">${c.mods.length}</span></button>`).join('')}</aside>`;
  const head = col ? `<div class="mod-section-head"><h2>${esc(col.name)}</h2><div class="mod-collection-actions"><button class="btn" data-act="col-on">Enable all</button><button class="btn" data-act="col-manage">Manage mods</button><button class="btn" data-act="col-delete">Delete</button></div></div>` : '';
  const table = list.length ? `<div class="mod-list">${list.map(m => `<div class="mod-row"><button class="mod-open" data-act="mod" data-id="${m.id}"><span class="mod-title">${esc(m.name)}${m.builtin ? ' <span class="pill b">Built-in</span>' : ''}</span><span class="mu sm">${esc(modGames(m))} · v${esc(m.version)}</span></button><label class="mod-switch" aria-label="Enable ${esc(m.name)}"><input type="checkbox" data-bind="modon" data-id="${m.id}"${m.enabled ? ' checked' : ''}><span></span></label></div>`).join('')}</div>` : '<p class="mu empty">No mods in this collection.</p>';
  return `<div class="ph"><h1>Mods</h1></div>${tabs}
<p class="mu sm" style="margin:-12px 0 0">Mods are Python files (.la) that set launch options for supported Windows games. Android does not allow changing other apps.</p>
<div class="mods-layout">${side}<section class="card mod-content">${head}${table}</section></div>`;
}

function vProfile() {
  const rows = stats(S.tournaments), me = rows.findIndex(r => r.name.toLowerCase() === S.profile.name.toLowerCase()), r = rows[me];
  return `<div class="ph"><h1>Profile</h1></div>
<form id="prof" class="card stack" style="max-width:480px"><label>Display name<input name="pname" required maxlength="30" value="${esc(S.profile.name)}"></label><label>Tag (optional)<input name="tag" maxlength="20" value="${esc(S.profile.tag)}"></label><div><button class="btn p">Save profile</button></div></form>
<section><h2 class="sh">Your record</h2>${r ? `<div class="sg"><div class="cell"><span class="mu sm">Rank</span><b>#${me + 1}</b></div><div class="cell"><span class="mu sm">Wins</span><b>${r.wins}</b></div><div class="cell"><span class="mu sm">Win rate</span><b>${r.rate}%</b></div><div class="cell"><span class="mu sm">Titles</span><b>${r.titles}</b></div></div>` : '<p class="mu">Register in a tournament with your display name to see your record here.</p>'}</section>`;
}

function vSettings() {
  const s = S.settings, p = platform();
  return `<div class="ph"><h1>Settings</h1></div>
<section class="card stack" style="max-width:560px"><h2>Appearance and performance</h2>
<label class="tg"><input type="checkbox" data-bind="compact"${s.compact ? ' checked' : ''}><span>Compact layout</span></label>
<label class="tg"><input type="checkbox" data-bind="lazy"${s.lazy ? ' checked' : ''}><span>Lazy-load game artwork</span></label>
<label class="tg"><input type="checkbox" data-bind="boostall"${s.boostAll ? ' checked' : ''}><span>Force FPS Boost on all games</span></label>
<label class="tg"><input type="checkbox" data-bind="autoscan"${s.autoscan ? ' checked' : ''}><span>Look for installed games when the app starts</span></label>
<label>Start page<select data-bind="start">${NAV.map(x => `<option value="${x[0]}"${s.start === x[0] ? ' selected' : ''}>${x[1]}</option>`).join('')}</select></label></section>
<section class="card stack" style="max-width:560px"><h2>Safety and permissions</h2>
<ul class="plist mu sm"><li>No storage permission is requested. Files are only read when you pick them.</li><li>${p === 'android' ? 'Android: LavO can see which apps are installed so it can find your games. It never changes them.' : 'Windows: LavO reads Steam and Epic game lists. It never changes game files.'}</li><li>Mods are Python files (.la) that run in a sandbox. They cannot import modules, open files, use the network or run programs. They can only set launch options, and every mod is checked and previewed before it is installed.</li></ul></section>
<section class="card stack" style="max-width:560px"><h2>Data</h2><p class="mu sm" style="margin:0">Everything is stored on this device only. Playtime is estimated from the time you spend away from LavO after pressing Play.</p>
<div class="acts"><button class="btn" data-act="export-all">Export backup</button><button class="btn" data-act="import-all">Import backup</button><button class="btn" data-act="sample">Load sample data</button><button class="btn" data-act="reset">Reset all data</button></div></section>
<section class="card about" style="max-width:560px"><img src="logo.png" alt=""><div><h2>LavO Gaming Hub</h2><span class="mu sm">Version 1.2.0</span></div></section>`;
}

/* ---------- dialogs ---------- */
const dlg = $('#dlg');
let cur = null;
function dlgOpen(html, h) {
  cur = h || {};
  dlg.innerHTML = `<form id="df" autocomplete="off">${html}</form>`;
  if (!dlg.open) dlg.showModal();
}
dlg.addEventListener('submit', e => {
  e.preventDefault();
  if (!cur || !cur.submit) { dlg.close(); return; }
  if (cur.submit(new FormData(e.target)) !== false) dlg.close();
});
dlg.addEventListener('click', e => {
  if (e.target === dlg) { dlg.close(); return; }
  const b = e.target.closest('[data-do]');
  if (!b) return;
  if (b.dataset.do === 'close') { dlg.close(); return; }
  const fn = cur && cur[b.dataset.do];
  if (fn && fn(b) !== false) dlg.close();
});
dlg.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'impfile' && t.files && t.files[0]) {
    const f = t.files[0], ext = t.dataset.ext;
    if (ext && !f.name.toLowerCase().endsWith(ext)) { toast('Only ' + ext + ' files are accepted'); t.value = ''; return; }
    if (f.size > 4000000) { toast('That file is too large'); t.value = ''; return; }
    const rd = new FileReader();
    rd.onload = () => { const x = $('#imptxt'); if (x) x.value = String(rd.result); };
    rd.readAsText(f);
  } else if (t.dataset && t.dataset.gm) {
    const g = gameById(t.dataset.g); if (!g) return;
    g.mods = g.mods || {}; g.mods[t.dataset.gm] = t.checked; save(); gameSheet(g.id);
  }
});
dlg.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'appq') { const q = t.value.trim().toLowerCase(); $$('.ap', dlg).forEach(l => { l.hidden = !!q && l.dataset.n.indexOf(q) < 0; }); }
  else if (t.dataset && t.dataset.sync) { const n = $('[name="' + t.dataset.sync + '"]', dlg); if (n) n.value = t.value; }
  else if (t.name && t.name.indexOf('s_') === 0 && t.type === 'number') { const r = $('[data-sync="' + t.name + '"]', dlg); if (r) r.value = t.value; }
});
function ask(msg, label, fn) {
  dlgOpen(`<h2>${esc(label)}?</h2><p class="mu" style="margin:0">${esc(msg)}</p><div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button type="button" class="btn p" data-do="ok">${esc(label)}</button></div>`, { ok() { fn(); } });
}
let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2800); }
function formErr(m) { const e = $('#err'); if (e) e.textContent = m; return false; }
async function sha256(t) {
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return ''; }
}

function resizeImg(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), i = new Image();
    i.onload = () => {
      const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
      const m = Math.min(i.width, i.height);
      c.getContext('2d').drawImage(i, (i.width - m) / 2, (i.height - m) / 2, m, m, 0, 0, s, s);
      URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.8));
    };
    i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('image')); };
    i.src = u;
  });
}
function copyText(t) {
  const fb = () => { const e = $('#exp'); if (!e) return; e.focus(); e.select(); try { toast(document.execCommand('copy') ? 'Copied' : 'Press Ctrl+C to copy'); } catch (_) { toast('Select the text and copy it'); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => toast('Copied'), fb); else fb();
}
function download(n, t) {
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); a.download = n;
    document.body.appendChild(a); a.click(); a.remove(); toast('Download started');
  } catch (e) { toast('Saving files is not supported here. Use Copy.'); }
}
function exportDlg(title, txt, fname) {
  dlgOpen(`<h2>${esc(title)}</h2><p class="mu sm" style="margin:0">Copy this text or save it as ${esc(fname)}. On Android, use Copy.</p><textarea id="exp" readonly rows="10">${esc(txt)}</textarea><div class="acts"><button type="button" class="btn" data-do="close">Close</button><button type="button" class="btn" data-do="save">Save file</button><button type="button" class="btn p" data-do="copy">Copy</button></div>`,
    { copy() { copyText(txt); return false; }, save() { download(fname, txt); return false; } });
}
function importDlg(title, hint, fn) {
  dlgOpen(`<h2>${esc(title)}</h2><p class="mu sm" style="margin:0">${esc(hint)}</p><textarea id="imptxt" name="txt" rows="8" required placeholder="Paste exported text here"></textarea><label>Or choose a file<input id="impfile" data-ext=".json" type="file" accept=".json,application/json,text/plain"></label><div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button class="btn p">Import</button></div>`,
    { submit(f) { return fn(String(f.get('txt'))); } });
}

/* ---- games ---- */
function addDetected(it) {
  const ex = S.games.find(g => g.kind === it.kind && g.ref === it.id);
  if (ex) { if (!ex.art && it.art) ex.art = it.art; if (!ex.source) ex.source = it.source; if (it.path) ex.path = it.path; if (it.dir) ex.dir = it.dir; if (it.engine) ex.engine = it.engine; return false; }
  S.games.push({ id: uid(), name: String(it.name).slice(0, 60), category: 'Other', art: it.art || '', minutes: 0, added: Date.now(), source: it.source || '', kind: it.kind, ref: it.id, path: it.path || '', dir: it.dir || '', engine: it.engine || '' });
  return true;
}
async function scanGames(silent) {
  const T = tauriCore(), P = lavoPlugin(); let items = [];
  try {
    if (T) items = await T.invoke('scan_games');
    else if (P) { const r = await P.listApps(); items = (r.apps || []).filter(a => a.game).map(a => ({ name: a.name, source: storeName(a.store), kind: 'android', id: a.pkg, path: '', art: a.icon || '' })); }
    else { if (!silent) toast('Installed-game detection is available in the Android and Windows apps'); return; }
  } catch (e) { if (!silent) toast('Could not scan installed games'); return; }
  let n = 0; (items || []).forEach(it => { if (it && it.name && it.id && addDetected(it)) n++; });
  if (P) {
    const installed = new Set((items || []).map(it => String(it.id)));
    S.games = S.games.filter(g => g.kind !== 'android' || installed.has(String(g.ref)));
    S.recent = S.recent.filter(id => S.games.some(g => g.id === id));
  }
  save(); render();
  if (n) toast(`Found ${n} new game${n > 1 ? 's' : ''}`); else if (!silent) toast('No new games found');
}
async function pickApps() {
  const P = lavoPlugin(); if (!P) return toast('Available in the Android app');
  let apps; try { apps = (await P.listApps()).apps || []; } catch (e) { return toast('Could not read installed apps'); }
  const have = new Set(S.games.filter(g => g.kind === 'android').map(g => g.ref));
  apps = apps.filter(a => !have.has(a.pkg)).sort((a, b) => a.name.localeCompare(b.name));
  if (!apps.length) return toast('No other apps found');
  dlgOpen(`<h2>Add from installed apps</h2><input id="appq" type="search" placeholder="Search apps" aria-label="Search apps"><div class="aplist">${apps.map(a => `<label class="tg ap" data-n="${esc(a.name.toLowerCase())}"><input type="checkbox" name="p" value="${esc(a.pkg)}"><span>${esc(a.name)}${a.game ? ' <span class="pill b">Game</span>' : ''}<span class="mu sm"> ${esc(storeName(a.store))}</span></span></label>`).join('')}</div><div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button class="btn p">Add selected</button></div>`, {
    submit(f) {
      const sel = new Set(f.getAll('p').map(String)); let n = 0;
      apps.forEach(a => { if (sel.has(a.pkg) && addDetected({ name: a.name, source: storeName(a.store), kind: 'android', id: a.pkg, path: '', art: a.icon || '' })) n++; });
      save(); render(); toast(n ? `Added ${n} game${n > 1 ? 's' : ''}` : 'Nothing selected');
    }
  });
}
function gameSheet(id) {
  const g = gameById(id); if (!g) return;
  const mods = S.mods.filter(m => appliesTo(m, g)), sp = launchSpec(g);
  let block = '';
  if (canMod(g)) {
    block = mods.length ? `<div class="stack" style="gap:10px"><h2>Mods</h2>${mods.map(m => { const forced = m.id === 'fps-boost' && S.settings.boostAll; return `<label class="tg"><input type="checkbox" data-g="${g.id}" data-gm="${esc(m.id)}"${modOnFor(m, g) ? ' checked' : ''}${forced ? ' disabled' : ''}><span>${esc(m.name)} <span class="mu sm">v${esc(m.version)}${forced ? ' · forced on' : ''}</span></span></label>`; }).join('')}<p class="mu sm" style="margin:0">Launch options: <code>${esc(sp.args.join(' ') || 'none')}</code>${sp.priority ? ' · CPU priority: <code>' + esc(sp.priority) + '</code>' : ''}</p>${g.engine && g.engine !== 'unknown' ? `<p class="mu sm" style="margin:0">Detected engine: ${esc(g.engine)}</p>` : '<p class="mu sm" style="margin:0">Engine not detected, so only CPU priority is boosted.</p>'}${sp.errors.length ? `<p class="sm" style="margin:0">Mod problem: ${esc(sp.errors[0])}</p>` : ''}</div>` : '<p class="mu sm" style="margin:0">No mods apply to this game yet. Add or enable mods on the Mods page.</p>';
  } else if (g.kind === 'android') block = '<p class="mu sm" style="margin:0">Android does not allow changing other apps, so LavO cannot boost or mod this game. It can still open it for you.</p>';
  else block = '<p class="mu sm" style="margin:0">Link this game to Steam, Epic or a program path (Edit) to launch it from here.</p>';
  dlgOpen(`<div class="gh"><span class="gi">${art(g)}</span><div class="grow"><h2>${esc(g.name)}</h2><span class="mu">${sub(g)}</span></div></div>${block}
<div class="acts"><button type="button" class="btn" data-do="edit">Edit</button><button type="button" class="btn" data-do="close">Close</button><button type="button" class="btn p" data-do="play"${g.kind === 'manual' ? ' disabled' : ''}>${ic('play', 16)} Play</button></div>`, {
    edit() { gameEdit(g.id); return false; },
    play() { playGame(g); }
  });
}
let lcT;
function showLaunch(g, msg) {
  const o = $('#launch'); clearTimeout(lcT);
  $('#lcArt').innerHTML = art(g); $('#lcName').textContent = g.name; $('#lcMsg').textContent = msg;
  o.hidden = false; o.classList.remove('on'); void o.offsetWidth; o.classList.add('on');
}
function hideLaunch(min) {
  const o = $('#launch'); clearTimeout(lcT);
  lcT = setTimeout(() => { o.classList.remove('on'); lcT = setTimeout(() => { o.hidden = true; }, 220); }, min || 0);
}
async function playGame(g) {
  const sp = launchSpec(g), T = tauriCore(), P = lavoPlugin();
  if (sp.errors.length) toast('Mod problem: ' + sp.errors[0]);
  showLaunch(g, sp.n ? `Launching with ${sp.n} mod${sp.n > 1 ? 's' : ''}…` : 'Launching…');
  try {
    if (g.kind === 'android' && P) await P.launch({ pkg: g.ref });
    else if (T && canMod(g)) {
      const dir = g.dir || (g.path ? g.path.replace(/[\\/][^\\/]*$/, '') : '');
      await T.invoke('launch_game', { req: { kind: g.kind, id: g.ref || '', path: g.path || '', dir, priority: sp.priority, args: sp.args, env: sp.env } });
    } else { hideLaunch(0); return toast('Launching works in the installed LavO app.'); }
  } catch (err) { hideLaunch(0); return toast('Could not launch: ' + (err && err.message ? err.message : err)); }
  markRecent(g.id); S.session = { id: g.id, t0: Date.now(), left: false }; save(); render();
  hideLaunch(950);
}
function endSession() {
  const s = S.session; if (!s || !s.left) return;
  const m = Math.round((Date.now() - s.t0) / 60000), g = gameById(s.id);
  S.session = null; if (g && m >= 1 && m <= 1440) g.minutes = (g.minutes || 0) + m;
  save(); render();
}
function gameDlg() {
  const win = platform() === 'windows';
  dlgOpen(`<h2>Add game</h2>
<label>Name<input name="name" required maxlength="60"></label>
<label>Category<select name="cat">${catOpts('Action')}</select></label>
<label>Where it is from (optional)<input name="source" list="srcs" maxlength="30" placeholder="Steam, Epic Games, GOG…"><datalist id="srcs"><option>Steam</option><option>Epic Games</option><option>GOG</option><option>Xbox</option><option>Google Play</option><option>Other</option></datalist></label>
${win ? '<label>Program path (optional)<input name="path" maxlength="260" placeholder="C:\\Games\\Game\\game.exe"></label>' : ''}
<label>Artwork (optional)<input name="art" type="file" accept="image/*"></label>
<div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button class="btn p">Add game</button></div>`, {
    submit(f) {
      const name = String(f.get('name')).trim(); if (!name) return false;
      if (S.games.some(x => x.name.toLowerCase() === name.toLowerCase())) { toast('A game with that name already exists'); return false; }
      const path = String(f.get('path') || '').trim();
      if (path && !/\.exe$/i.test(path)) { toast('The program path must end in .exe'); return false; }
      const g = { id: uid(), name, category: String(f.get('cat')), art: '', minutes: 0, added: Date.now(), source: String(f.get('source') || '').trim().slice(0, 30), kind: path ? 'exe' : 'manual', ref: '', path };
      const file = f.get('art');
      const done = a => { g.art = a; S.games.push(g); save(); render(); toast('Game added'); };
      if (file && file.size) resizeImg(file).then(done, () => done('')); else done('');
    }
  });
}
function gameEdit(id) {
  const g = gameById(id); if (!g) return;
  const showPath = platform() === 'windows' && (g.kind === 'exe' || g.kind === 'manual');
  dlgOpen(`<h2>Edit game</h2>
<label>Name<input name="name" required maxlength="60" value="${esc(g.name)}"></label>
<label>Category<select name="cat">${catOpts(g.category)}</select></label>
<label>Where it is from<input name="source" maxlength="30" value="${esc(g.source)}"></label>
${showPath ? `<label>Program path<input name="path" maxlength="260" value="${esc(g.path)}" placeholder="C:\\Games\\Game\\game.exe"></label>` : ''}
<div class="sess"><label>Add playtime (minutes)<input id="mins" type="number" min="1" max="1440" value="30"></label><button type="button" class="btn" data-do="log">Add</button></div>
<div class="acts"><button type="button" class="btn" data-do="remove">Remove</button><button type="button" class="btn" data-do="close">Cancel</button><button class="btn p">Save</button></div>`, {
    submit(f) {
      const name = String(f.get('name')).trim(); if (!name) return false;
      if (S.games.some(x => x !== g && x.name.toLowerCase() === name.toLowerCase())) { toast('A game with that name already exists'); return false; }
      if (showPath) { const p = String(f.get('path') || '').trim(); if (p && !/\.exe$/i.test(p)) { toast('The program path must end in .exe'); return false; } g.path = p; if (g.kind !== 'steam' && g.kind !== 'epic') g.kind = p ? 'exe' : 'manual'; }
      g.name = name; g.category = String(f.get('cat')); g.source = String(f.get('source') || '').trim().slice(0, 30);
      save(); render();
    },
    log() { const m = Math.max(1, Math.min(1440, parseInt($('#mins').value, 10) || 0)); g.minutes = (g.minutes || 0) + m; markRecent(g.id); save(); render(); toast('Playtime added'); },
    remove() { ask(`Remove “${g.name}” from your library?`, 'Remove', () => removeGames([g.id])); return false; }
  });
}
function removeGames(ids) {
  S.games = S.games.filter(g => ids.indexOf(g.id) < 0); S.recent = S.recent.filter(x => ids.indexOf(x) < 0);
  ui.sel.clear(); save(); render(); toast('Removed');
}

/* ---- tournaments ---- */
function tournamentDlg() {
  dlgOpen(`<h2>Create tournament</h2><label>Name<input name="name" required maxlength="60"></label>
<label>Game<select name="game"><option value="">No game</option>${S.games.map(g => `<option>${esc(g.name)}</option>`).join('')}</select></label>
<label>Participants or teams (one per line, optional)<textarea name="ps" rows="5"></textarea></label>
<div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button class="btn p">Create</button></div>`, {
    submit(f) {
      const name = String(f.get('name')).trim(); if (!name) return false;
      const seen = new Set(), players = [];
      String(f.get('ps')).split('\n').map(s => s.trim()).filter(Boolean).forEach(p => { const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); players.push(p.slice(0, 40)); } });
      const t = { id: uid(), name, game: String(f.get('game')), players, rounds: null, status: 'Open', champion: null, created: Date.now() };
      S.tournaments.push(t); save(); location.hash = '#/tournaments/' + t.id;
    }
  });
}
function matchDlg(t, r, j) {
  const m = t.rounds[r][j]; if (!m.a || !m.b) return;
  dlgOpen(`<h2>Match result</h2><label>${esc(m.a)}<input name="sa" type="number" min="0" step="1" inputmode="numeric" required value="${m.sa == null ? '' : m.sa}"></label>
<label>${esc(m.b)}<input name="sb" type="number" min="0" step="1" inputmode="numeric" required value="${m.sb == null ? '' : m.sb}"></label>
<div class="acts"><button type="button" class="btn" data-do="close">Cancel</button>${m.w ? '<button type="button" class="btn" data-do="clear">Clear result</button>' : ''}<button class="btn p">Save result</button></div>`, {
    submit(f) {
      const sa = parseInt(f.get('sa'), 10), sb = parseInt(f.get('sb'), 10);
      if (isNaN(sa) || isNaN(sb) || sa < 0 || sb < 0) { toast('Enter both scores'); return false; }
      if (sa === sb) { toast('A match needs a winner'); return false; }
      setRes(t, r, j, sa, sb); save(); render();
    },
    clear() { m.sa = null; m.sb = null; m.w = null; propagate(t); save(); render(); }
  });
}
function playerDlg(n) {
  const all = stats(S.tournaments), i = all.findIndex(p => p.name === n), p = all[i]; if (!p) return;
  const ts = S.tournaments.filter(t => t.players.includes(n)).map(t => {
    const s = stats([t]).find(x => x.name === n);
    return `<li><span>${esc(t.name)}</span><span class="mu sm">${s.wins} W · ${s.losses} L${t.champion === n ? ' · Champion' : ''}</span></li>`;
  }).join('');
  dlgOpen(`<h2>${esc(n)}</h2><p class="mu" style="margin:0">Global rank #${i + 1}</p>
<div class="sg"><div class="cell"><span class="mu sm">Played</span><b>${p.played}</b></div><div class="cell"><span class="mu sm">Wins</span><b>${p.wins}</b></div><div class="cell"><span class="mu sm">Win rate</span><b>${p.rate}%</b></div><div class="cell"><span class="mu sm">Titles</span><b>${p.titles}</b></div></div>
<h2>Tournaments</h2><ul class="plist">${ts}</ul><div class="acts"><button type="button" class="btn p" data-do="close">Close</button></div>`);
}

/* ---- mods ---- */
function settingField(s, val) {
  const n = 's_' + s.key;
  if (s.type === 'number') return `<label>${esc(s.label)}<div class="rg"><input type="range" data-sync="${n}" min="${s.min}" max="${s.max}" step="${s.step}" value="${val}" aria-label="${esc(s.label)} slider"><input type="number" name="${n}" min="${s.min}" max="${s.max}" step="any" value="${val}" required></div></label>`;
  if (s.type === 'toggle') return `<label class="tg"><input type="checkbox" name="${n}"${val ? ' checked' : ''}><span>${esc(s.label)}</span></label>`;
  return `<label>${esc(s.label)}<select name="${n}">${s.options.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
}
function modDlg(id) {
  const m = S.mods.find(x => x.id === id); if (!m) return;
  const val = s => { const r = (m.values || {})[s.key]; return s.type === 'number' ? clampNum(s, r === undefined ? s.default : r) : s.type === 'toggle' ? (r === undefined ? s.default : !!r) : (s.options.indexOf(r) >= 0 ? r : s.default); };
  const saveFields = f => {
    const games = String(f.get('games') || '').split(',').map(x => x.trim()).filter(Boolean);
    if (games.length > 20 || games.some(x => x.length > 60)) return false;
    const vals = {};
    m.settings.forEach(s => { const n = 's_' + s.key; vals[s.key] = s.type === 'number' ? clampNum(s, f.get(n)) : s.type === 'toggle' ? f.has(n) : (s.options.indexOf(String(f.get(n))) >= 0 ? String(f.get(n)) : s.default); });
    m.games = games.length ? games : ['*']; m.values = vals; m.enabled = f.has('enabled'); save(); return true;
  };
  dlgOpen(`<div class="mod-dialog-head"><div><h2>${esc(m.name)} <span class="mu sm">v${esc(m.version)}${m.author ? ' by ' + esc(m.author) : ''}</span></h2><p class="mu sm" style="margin:4px 0 0">${esc(m.description)}</p></div><button type="button" class="ib" data-do="close" aria-label="Close">${ic('x', 20)}</button></div>
<label>Applies to (* for all games, or game names separated by commas)<input name="games" maxlength="400" value="${esc(m.games.join(', '))}"></label>
${m.settings.length ? '<h2>Settings</h2>' + m.settings.map(s => settingField(s, val(s))).join('') : '<p class="mu sm" style="margin:0">This mod has no settings.</p>'}
<label class="tg"><input type="checkbox" name="enabled"${m.enabled ? ' checked' : ''}><span>Enabled</span></label><p class="mu sm">Changes are saved automatically.</p><div id="err" class="err"></div>`, {
    submit(f) { if (!saveFields(f)) return formErr('Use up to 20 game names, 60 characters each.'); render(); },
    close() { dlg.close(); return false; }
  });
  const form = $('#df');
  const persist = () => { if (!form) return; if (!saveFields(new FormData(form))) { const e = $('#err'); if (e) e.textContent = 'Use up to 20 game names, 60 characters each.'; } else { const e = $('#err'); if (e) e.textContent = ''; } };
  form.addEventListener('input', persist);
  form.addEventListener('change', persist);
}

function codeDlg(m, prefill) {
  dlgOpen(`<h2>${m ? 'Edit code: ' + esc(m.name) : 'Create mod'}</h2>
<p class="mu sm" style="margin:0">Mods are written in Python and saved as .la files. They run in a safe sandbox: no imports, files, network or system access. They can only set launch options.</p>
<textarea name="code" class="mono" rows="16" spellcheck="false" autocapitalize="off" autocomplete="off" required>${esc(m ? m.code : (prefill || MOD_TEMPLATE))}</textarea><div id="err" class="err"></div>
<div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button class="btn p">${m ? 'Save code' : 'Create'}</button></div>`, {
    submit(f) {
      const code = String(f.get('code')).replace(/\r\n/g, '\n'), d = declare(code);
      if (d.error) return formErr(d.error);
      if (m) {
        if (d.mod.id !== m.id) return formErr('Keep the same name to edit this mod, or create a new mod with the new name.');
        if (d.mod.version !== m.version) m.history = (m.history || []).concat(m.version);
        Object.assign(m, { name: d.mod.name, version: d.mod.version, author: d.mod.author, description: d.mod.description, settings: d.mod.settings, games: d.mod.games, code });
        save(); render(); toast('Mod saved'); return;
      }
      if (S.mods.some(x => x.id === d.mod.id)) return formErr('A mod named "' + d.mod.name + '" already exists. Change the name in the code.');
      S.mods.push(Object.assign(d.mod, { enabled: true, builtin: false, source: 'created', values: {}, history: [] })); save(); render(); toast('Mod created');
    }
  });
}
function importLaDlg() {
  dlgOpen(`<h2>Import .la file</h2><p class="mu sm" style="margin:0">Only .la files are accepted (a Python mod renamed to .la). You can review the mod and its code before it is installed.</p>
<label>Choose a .la file<input id="impfile" data-ext=".la" type="file" accept=".la"></label>
<label>Or paste the .la text<textarea id="imptxt" name="txt" class="mono" rows="6" spellcheck="false" placeholder="Paste .la text here"></textarea></label><div id="err" class="err"></div>
<div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button class="btn p">Review</button></div>`, { submit(f) { review(String(f.get('txt')).replace(/\r\n/g, '\n').trim()); return false; } });
}
async function review(txt) {
  if (!txt) return formErr('Choose a .la file or paste its text.');
  if (txt.length > 600000) return formErr('That file is too large to be a .la file.');
  if (txt[0] === '{') return formErr('This is an old JSON .la file. Mods are now written in Python.');
  let chunks = [txt], cname = '';
  if (/^#\s*lavo-collection:/i.test(txt)) {
    const parts = txt.split(/^#\s*={3,}\s*mod\s*={3,}\s*$/im), h = /^#\s*lavo-collection:[ \t]*([^\n]*)/i.exec(parts[0]);
    cname = ((h && h[1].trim()) || 'Imported collection').slice(0, 60); chunks = parts.slice(1).filter(x => x.trim());
    if (!chunks.length || chunks.length > 50) return formErr('This collection file is empty or too large.');
  }
  const defs = [];
  for (let i = 0; i < chunks.length; i++) { const d = declare(chunks[i].trim()); if (d.error) return formErr((chunks.length > 1 ? 'Mod ' + (i + 1) + ': ' : '') + d.error); defs.push(d.mod); }
  const hash = await sha256(txt);
  const row = d => {
    let ex = 'none'; try { const o = modOpts({ code: d.code, values: {} }, { name: '', engine: 'source', kind: 'steam', source: '' }); ex = o.args.join(' ') || 'none'; } catch (e) { ex = 'could not run'; }
    return `<div class="card"><h2>${esc(d.name)} <span class="mu sm">v${esc(d.version)}${d.author ? ' by ' + esc(d.author) : ''}</span></h2><p class="mu sm" style="margin:4px 0 0">${esc(d.description)}</p><p class="sm" style="margin:6px 0 0">Applies to: ${esc(modGames(d))} · ${d.settings.length} setting${d.settings.length === 1 ? '' : 's'}</p><p class="sm" style="margin:4px 0 0">Example launch options (Source engine): <code>${esc(ex)}</code></p><details><summary class="sm">View code</summary><pre class="code">${esc(d.code)}</pre></details></div>`;
  };
  dlgOpen(`<h2>${cname ? 'Install collection “' + esc(cname) + '”' : 'Install mod'}?</h2>${defs.map(row).join('')}
<p class="mu sm" style="margin:0">Checked and sandboxed: this mod can only set launch options. It cannot run programs, read files or use the network.${hash ? ' SHA-256 ' + hash.slice(0, 16) + '…' : ''}</p>
<div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button type="button" class="btn p" data-do="inst">Install</button></div>`, { inst() { installMods(defs, cname); } });
  return true;
}
function installMods(defs, cname) {
  let added = 0, updated = 0; const ids = [];
  defs.forEach(d => {
    const ex = S.mods.find(m => m.id === d.id);
    if (ex) { ids.push(ex.id); if (!ex.builtin && cmpVer(d.version, ex.version) > 0) { ex.history = (ex.history || []).concat(ex.version); Object.assign(ex, { name: d.name, version: d.version, author: d.author, description: d.description, games: d.games, settings: d.settings, code: d.code }); updated++; } }
    else { S.mods.push(Object.assign({}, d, { enabled: true, builtin: false, source: 'file', values: {}, history: [] })); ids.push(d.id); added++; }
  });
  if (cname) { let name = cname; while (S.collections.some(c => c.name.toLowerCase() === name.toLowerCase())) name += ' (imported)'; const c = { id: uid(), name, mods: ids }; S.collections.push(c); ui.modCol = c.id; }
  save(); render(); toast(`${added} added, ${updated} updated`);
}
function colDlg() {
  dlgOpen(`<h2>New collection</h2><label>Name<input name="name" required maxlength="60"></label><div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button class="btn p">Create</button></div>`, {
    submit(f) {
      const name = String(f.get('name')).trim(); if (!name) return false;
      if (S.collections.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast('A collection with that name exists'); return false; }
      const c = { id: uid(), name, mods: [] }; S.collections.push(c); ui.modCol = c.id; save(); render();
    }
  });
}
function manageDlg(c) {
  dlgOpen(`<h2>Mods in “${esc(c.name)}”</h2><div class="stack" style="gap:10px">${S.mods.map(m => `<label class="tg"><input type="checkbox" name="m" value="${esc(m.id)}"${c.mods.indexOf(m.id) >= 0 ? ' checked' : ''}><span>${esc(m.name)}</span></label>`).join('')}</div>
<div class="acts"><button type="button" class="btn" data-do="close">Cancel</button><button class="btn p">Save</button></div>`, { submit(f) { c.mods = f.getAll('m').map(String); save(); render(); } });
}
function colExport() {
  const col = S.collections.find(c => c.id === ui.modCol);
  const list = col ? S.mods.filter(m => col.mods.indexOf(m.id) >= 0) : S.mods;
  const name = col ? col.name : 'All mods';
  exportDlg('Export ' + name, '# lavo-collection: ' + name + '\n' + list.map(m => '# ==== mod ====\n' + m.code.trim() + '\n').join('\n'), slug(name) + '.la');
}
function importBackup(txt) {
  let o; try { o = JSON.parse(txt); } catch (e) { toast('That is not valid JSON'); return false; }
  if (!o || o.format !== 'lavo-backup' || !o.data || typeof o.data !== 'object') { toast('This is not a LavO backup'); return false; }
  S = normalize(o.data); S.session = null; save(); render(); toast('Backup restored'); return true;
}

function sample() {
  if (S.games.some(g => g.name.indexOf('Sample ') === 0)) return toast('Sample data is already loaded');
  const now = Date.now();
  const G = [['Sample Racer', 'Racing', 340], ['Sample Arena', 'Shooter', 620], ['Sample Kingdom', 'Strategy', 1250], ['Sample Quest', 'RPG', 905], ['Sample Puzzle', 'Puzzle', 130], ['Sample Football', 'Sports', 410]];
  const ids = G.map((g, i) => { const id = uid(); S.games.push({ id, name: g[0], category: g[1], art: '', minutes: g[2], added: now - i * 1000, source: 'Sample', kind: 'manual', ref: '', path: '' }); return id; });
  S.recent = ids.slice(0, 5).concat(S.recent.filter(x => ids.indexOf(x) < 0)).slice(0, 12);
  const t1 = { id: uid(), name: 'Sample Cup', game: 'Sample Arena', players: ['Alex', 'Sam', 'Riley', 'Jordan', 'Casey', 'Morgan', 'Taylor', 'Jamie'], rounds: null, status: 'Open', champion: null, created: now };
  build(t1); [0, 1, 2, 3].forEach(j => setRes(t1, 0, j, 2, 1)); setRes(t1, 1, 0, 3, 2);
  const t2 = { id: uid(), name: 'Sample League', game: 'Sample Racer', players: ['Alex', 'Sam', 'Riley', 'Jordan'], rounds: null, status: 'Open', champion: null, created: now - 1000 };
  S.tournaments.push(t1, t2);
  S.collections.push({ id: uid(), name: 'Starter Set', mods: ['fps-boost', 'sensitivity', 'skip-intros'] });
  save(); render(); toast('Sample data loaded');
}

/* ---------- routing and rendering ---------- */
function route() {
  const p = (location.hash || '').replace(/^#\/?/, '').split('/');
  return PAGES.indexOf(p[0]) >= 0 ? { page: p[0], id: p[1] || '' } : { page: PAGES.indexOf(S.settings.start) >= 0 ? S.settings.start : 'home', id: '' };
}
const curT = () => { const r = route(); return r.page === 'tournaments' ? S.tournaments.find(t => t.id === r.id) : null; };
let lastKey = null, lastIdx = -1, lastPage = '';
function moveInd() {
  const place = (cont, sel, ind, vertical) => {
    const a = $(sel, cont), i = $(ind); if (!i) return;
    if (!a || !a.offsetWidth) { i.style.opacity = '0'; return; }
    i.style.opacity = '1';
    if (vertical) { i.style.transform = 'translateY(' + a.offsetTop + 'px)'; i.style.height = a.offsetHeight + 'px'; i.style.width = a.offsetWidth + 'px'; i.style.left = a.offsetLeft + 'px'; }
    else { i.style.transform = 'translateX(' + a.offsetLeft + 'px)'; i.style.width = a.offsetWidth + 'px'; }
  };
  place($('#side'), '.ni.on', '#indS', true); place($('#bottom'), '.bi.on', '#indB', false);
}
function render() {
  const r = route(), key = r.page + '/' + r.id, idx = PAGES.indexOf(r.page), v = $('#view');
  document.body.classList.toggle('compact', !!S.settings.compact);
  const V = { home: vHome, library: vLibrary, tournaments: () => r.id ? vTournament(r.id) : vTournaments(), leaderboards: vLeaders, mods: vMods, profile: vProfile, settings: vSettings };
  v.innerHTML = V[r.page]();
  if (key !== lastKey) {
    const dir = lastKey === null || r.page === lastPage ? 'u' : (idx > lastIdx ? 'r' : 'l');
    v.className = ''; void v.offsetWidth; v.className = 'enter dir-' + dir; lastKey = key; lastIdx = idx; lastPage = r.page;
  }
  $$('[data-p]').forEach(a => { const on = a.dataset.p === r.page; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  moveInd();
}
function buildNav() {
  $('#side').innerHTML = `<span class="ind no-anim" id="indS"></span><a class="brand" href="#/home"><img src="logo.png" alt="">LavO Hub</a>` + NAV.map(x => `<a class="ni" href="#/${x[0]}" data-p="${x[0]}">${ic(x[0])}<span>${x[1]}</span></a>`).join('') + `<span class="grow"></span><a class="ni" href="#/settings" data-p="settings">${ic('settings')}<span>Settings</span></a>`;
  $('#bottom').innerHTML = '<span class="ind ind-b no-anim" id="indB"></span>' + BOTTOM.map(x => `<a class="bi" href="#/${x[0]}" data-p="${x[0]}">${ic(x[0], 22)}<span>${x[1]}</span></a>`).join('');
  $('#top').innerHTML = `<a class="brand" href="#/home"><img src="logo.png" alt="">LavO Hub</a><a class="ib" href="#/profile" data-p="profile" aria-label="Profile">${ic('profile')}</a><a class="ib" href="#/settings" data-p="settings" aria-label="Settings">${ic('settings')}</a>`;
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id, t = curT();
  switch (a) {
    case 'game': return gameSheet(id);
    case 'sample': return sample();
    case 'organize': ui.org = !ui.org; ui.sel.clear(); return render();
    case 'sel': if (ui.sel.has(id)) ui.sel.delete(id); else ui.sel.add(id); return refreshLib();
    case 'sel-all': libList().forEach(g => ui.sel.add(g.id)); return refreshLib();
    case 'sel-cat': { if (!ui.sel.size) return toast('Select games first'); const c = $('#orgcat').value; S.games.forEach(g => { if (ui.sel.has(g.id)) g.category = c; }); ui.sel.clear(); save(); return render(); }
    case 'sel-remove': { if (!ui.sel.size) return toast('Select games first'); const ids = Array.from(ui.sel); return ask(`Remove ${ids.length} game${ids.length > 1 ? 's' : ''} from your library?`, 'Remove', () => removeGames(ids)); }
    case 'cat': ui.cat = b.dataset.v; return render();
    case 'new-t': return tournamentDlg();
    case 't-start': if (t) { if (t.players.length < 2) return toast('Add at least 2 participants'); build(t); save(); render(); } return;
    case 't-reset': if (t) ask('This clears the bracket and every match result.', 'Reset', () => { t.rounds = null; t.champion = null; t.status = 'Open'; save(); render(); }); return;
    case 't-delete': if (t) ask(`Delete “${t.name}”? This cannot be undone.`, 'Delete', () => { S.tournaments = S.tournaments.filter(x => x !== t); save(); location.hash = '#/tournaments'; }); return;
    case 't-rm': if (t) { t.players = t.players.filter(p => p !== b.dataset.n); save(); render(); } return;
    case 'match': if (t) matchDlg(t, +b.dataset.r, +b.dataset.j); return;
    case 't-board': if (t) { ui.lb = 't'; ui.lbT = t.id; location.hash = '#/leaderboards'; } return;
    case 'lb-tab': ui.lb = b.dataset.v; return render();
    case 'lb-player': return playerDlg(b.dataset.n);
    case 'mod-tab': ui.modTab = b.dataset.v === 'compat' ? 'compat' : 'mods'; return render();
    case 'mod': return modDlg(id);
    case 'create-mod': return codeDlg(null);
    case 'import-la': return importLaDlg();
    case 'new-col': return colDlg();
    case 'col': ui.modCol = id; return render();
    case 'col-on': { const c = S.collections.find(x => x.id === ui.modCol); if (c) { S.mods.forEach(m => { if (c.mods.indexOf(m.id) >= 0) m.enabled = true; }); save(); render(); toast('Enabled all mods in this collection'); } return; }
    case 'col-manage': { const c = S.collections.find(x => x.id === ui.modCol); if (c) manageDlg(c); return; }
    case 'col-delete': { const c = S.collections.find(x => x.id === ui.modCol); if (c) ask(`Delete the collection “${c.name}”? The mods stay installed.`, 'Delete', () => { S.collections = S.collections.filter(x => x !== c); ui.modCol = 'all'; save(); render(); }); return; }
    case 'mods-export': return colExport();
    case 'export-all': return exportDlg('Export backup', JSON.stringify({ format: 'lavo-backup', v: 1, data: S }, null, 2), 'lavo-backup.json');
    case 'import-all': return importDlg('Import backup', 'Importing replaces all data on this device.', importBackup);
    case 'reset': return ask('This deletes every game, tournament and your mod settings on this device.', 'Reset', () => { S = normalize(null); ui.sel.clear(); ui.org = false; ui.cat = 'All'; ui.q = ''; save(); if (location.hash !== '#/home') location.hash = '#/home'; else render(); toast('All data reset'); });
  }
});
document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.bind === 'q') { ui.q = e.target.value; refreshLib(); } });
document.addEventListener('change', e => {
  const t = e.target, b = t.dataset && t.dataset.bind; if (!b) return;
  if (b === 'lbT') { ui.lbT = t.value; render(); }
  else if (b === 'compact' || b === 'lazy' || b === 'autoscan') { S.settings[b] = t.checked; save(); render(); }
  else if (b === 'boostall') { S.settings.boostAll = t.checked; save(); render(); }
  else if (b === 'start') { S.settings.start = t.value; save(); }
  else if (b === 'modon') { const m = S.mods.find(x => x.id === t.dataset.id); if (m) { m.enabled = t.checked; save(); } }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'addp') {
    e.preventDefault(); const t = curT(), n = f.elements.pname.value.trim(); if (!t || !n) return;
    if (t.players.some(p => p.toLowerCase() === n.toLowerCase())) return toast('That name is already registered');
    t.players.push(n); save(); render(); const i = $('#addp input'); if (i) i.focus();
  } else if (f.id === 'prof') {
    e.preventDefault(); S.profile.name = f.elements.pname.value.trim() || 'Player'; S.profile.tag = f.elements.tag.value.trim(); save(); render(); toast('Profile saved');
  }
});
window.addEventListener('hashchange', () => { render(); $('#view').scrollTop = 0; });
document.addEventListener('visibilitychange', () => { if (!S.session) return; if (document.hidden) { S.session.left = true; save(); } else endSession(); });
window.addEventListener('blur', () => { if (S.session && !S.session.left) { S.session.left = true; save(); } });
window.addEventListener('focus', () => { if (S.session && S.session.left && Date.now() - S.session.t0 > 20000) endSession(); });

buildNav();
render();
window.addEventListener('resize', moveInd);
requestAnimationFrame(() => requestAnimationFrame(() => { $$('.ind').forEach(e => e.classList.remove('no-anim')); moveInd(); }));
if (S.session && S.session.left) endSession();
if (S.settings.autoscan) scanGames(true);
})();
