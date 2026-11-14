import { h, field, toast, clear } from '../ui.js';
import { listDevices, unlockDeviceLabels, canSelectSpeaker } from '../services/audio.js';
import { updateDisplayName } from '../services/auth.js';
import { clearConfig, getConfig } from '../config.js';

export function createSettingsView(ctx) {
  const s = () => ctx.settings.get();

  const display = h('input', { maxlength: 32, value: ctx.me.display });
  const status = h('select', { onchange: () => { ctx.settings.set({ status: status.value }); ctx.hub.setStatus(status.value); } },
    ...[['online', 'Online'], ['away', 'Away'], ['dnd', 'Do not disturb'], ['invisible', 'Invisible']]
      .map(([v, l]) => h('option', { value: v }, l)));
  status.value = s().status;

  const mic = h('select', { onchange: async () => {
    ctx.settings.set({ micId: mic.value });
    try { await ctx.room?.switchMic(); } catch (e) { toast(e.message, 'error'); }
  } });
  const spk = h('select', { onchange: () => { ctx.settings.set({ speakerId: spk.value }); ctx.room?.applySpeaker(); } });
  const spkField = field('Speaker', spk);
  spkField.hidden = !canSelectSpeaker();

  async function fillDevices(unlock) {
    try {
      if (unlock) await unlockDeviceLabels();
      const { mics, speakers } = await listDevices();
      const opt = (list, cur, fallback) => {
        const out = [h('option', { value: '' }, 'System default')];
        list.forEach((d, i) => out.push(h('option', { value: d.deviceId }, d.label || `${fallback} ${i + 1}`)));
        return out;
      };
      clear(mic).append(...opt(mics, s().micId, 'Microphone'));
      clear(spk).append(...opt(speakers, s().speakerId, 'Speaker'));
      mic.value = s().micId; spk.value = s().speakerId;
      if (mic.value !== s().micId) mic.value = '';
      if (spk.value !== s().speakerId) spk.value = '';
    } catch (e) { toast(e.message, 'error'); }
  }

  const toggle = (label, hint, key, after) => {
    const box = h('input', { type: 'checkbox' });
    box.checked = !!s()[key];
    box.addEventListener('change', () => { ctx.settings.set({ [key]: box.checked }); after?.(); });
    return h('label', { class: 'switch' },
      h('span', { class: 'grow' }, h('div', { class: 'name' }, label), h('div', { class: 'sub' }, hint)), box);
  };

  const noteVoice = h('p', { class: 'notice' }, 'Audio processing changes apply the next time you join voice.');

  const el = h('div', { class: 'settings' },
    h('h2', null, 'Settings'),
    h('section', null,
      h('h3', null, 'Profile'),
      field('Username', h('input', { value: `@${ctx.me.name}`, disabled: true })),
      field('Display name', display),
      h('button', { class: 'btn', onclick: async () => {
        try { ctx.me.display = (await updateDisplayName(ctx.me.id, display.value)) || ctx.me.name; toast('Saved'); ctx.refreshMe(); }
        catch (e) { toast(e.message, 'error'); }
      } }, 'Save name'),
      field('Status', status)),
    h('section', null,
      h('h3', null, 'Audio'),
      field('Microphone', mic), spkField,
      h('button', { class: 'btn', onclick: () => fillDevices(true) }, 'Detect devices'),
      toggle('Noise suppression', 'Filters keyboard and background noise', 'noiseSuppression'),
      toggle('Echo cancellation', 'Prevents your speakers feeding back into your mic', 'echoCancellation'),
      toggle('Automatic gain', 'Keeps your volume steady', 'autoGain'),
      noteVoice),
    h('section', null,
      h('h3', null, 'Performance'),
      toggle('Performance mode', 'Turns off animations, lowers voice bitrate and checks the network less often', 'performanceMode', () => ctx.applyPerf())),
    h('section', null,
      h('h3', null, 'Account'),
      h('button', { class: 'btn danger', onclick: () => ctx.logout() }, 'Log out'),
      getConfig()?.baked ? null : h('button', { class: 'btn ghost', onclick: () => {
        if (confirm('Disconnect from this server? You will be logged out.')) { clearConfig(); ctx.logout().then(() => location.reload()); }
      } }, 'Change server')));

  fillDevices(false);
  return { el };
}
