import './styles.css';
import { getConfig, isAndroid } from './config.js';
import { initSupabase, sb } from './supabase.js';
import { renderSetup, renderAuth } from './views/gate.js';
import { mountApp } from './views/app.js';
import { loadProfile } from './services/auth.js';
import { createSettings } from './services/settings.js';
import { toast } from './ui.js';

const root = document.getElementById('app');
document.body.classList.add(isAndroid() ? 'android' : 'desktop');

let session = null; // current mounted app
const settings = createSettings();
document.body.classList.toggle('perf', !!settings.get().performanceMode);

async function start(user) {
  if (session) return;
  try {
    const profile = await loadProfile(user.id);
    await settings.attach(user.id);
    session = mountApp({ root, user, profile, settings });
  } catch (e) {
    toast(e.message || 'Could not load your profile', 'error');
    await sb().auth.signOut();
    showAuth();
  }
}

function showAuth() {
  session = null;
  renderAuth(root, (user) => start(user));
}

async function boot() {
  const cfg = getConfig();
  if (!cfg) return renderSetup(root);
  initSupabase(cfg);
  sb().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && session) { session.destroy(); showAuth(); }
    else if (event === 'SIGNED_OUT') showAuth();
  });
  const { data } = await sb().auth.getSession();
  if (data.session?.user) await start(data.session.user);
  else showAuth();
}

boot().catch((e) => { console.error(e); toast(e.message || 'Failed to start', 'error'); });
