import { h, field, toast, logo } from '../ui.js';
import { saveConfig } from '../config.js';
import { signIn, signUp } from '../services/auth.js';

export function renderSetup(root) {
  const url = h('input', { type: 'url', placeholder: 'https://xxxx.supabase.co', required: true, autocomplete: 'off' });
  const key = h('input', { type: 'password', placeholder: 'anon public key', required: true, autocomplete: 'off' });
  const form = h('form', { class: 'card gate', onsubmit: (e) => {
    e.preventDefault();
    const u = url.value.trim().replace(/\/+$/, '');
    if (!/^https:\/\/.+/.test(u)) return toast('Server URL must start with https://', 'error');
    saveConfig({ url: u, key: key.value.trim() });
    location.reload();
  } },
  logo('logo big'),
  h('h1', null, 'Connect your server'),
  h('p', { class: 'muted' }, 'Enter your Supabase project URL and anon key. They are stored on this device only.'),
  field('Project URL', url), field('Anon key', key),
  h('button', { class: 'btn primary wide', type: 'submit' }, 'Save and continue'));
  root.replaceChildren(h('div', { class: 'center' }, form));
}

export function renderAuth(root, onSignedIn) {
  let mode = 'login';
  const email = h('input', { type: 'email', autocomplete: 'email', required: true });
  const username = h('input', { type: 'text', autocomplete: 'username', maxlength: 20, autocapitalize: 'off', spellcheck: 'false' });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true, minlength: 8 });
  const userField = field('Username', username);
  const title = h('h1');
  const submit = h('button', { class: 'btn primary wide', type: 'submit' });
  const switchBtn = h('button', { class: 'link', type: 'button' });
  const err = h('p', { class: 'form-error', role: 'alert' });

  function paint() {
    const reg = mode === 'register';
    title.textContent = reg ? 'Create your account' : 'Welcome back';
    submit.textContent = reg ? 'Create account' : 'Log in';
    switchBtn.textContent = reg ? 'I already have an account' : 'Create an account';
    userField.hidden = !reg;
    password.autocomplete = reg ? 'new-password' : 'current-password';
    err.textContent = '';
  }

  const form = h('form', { class: 'card gate', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    submit.disabled = true;
    try {
      if (mode === 'register') {
        const data = await signUp({ email: email.value.trim(), password: password.value, username: username.value.trim() });
        if (!data.session) {
          toast('Account created. Confirm your email, then log in.');
          mode = 'login'; paint();
          return;
        }
        onSignedIn(data.user);
      } else {
        const data = await signIn({ email: email.value.trim(), password: password.value });
        onSignedIn(data.user);
      }
    } catch (ex) {
      err.textContent = ex.message || 'Something went wrong';
    } finally { submit.disabled = false; }
  } },
  logo('logo big'), title,
  field('Email', email), userField, field('Password', password),
  err, submit, switchBtn);
  switchBtn.addEventListener('click', () => { mode = mode === 'login' ? 'register' : 'login'; paint(); });
  paint();
  root.replaceChildren(h('div', { class: 'center' }, form));
}
