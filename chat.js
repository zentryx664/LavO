import { h, clear, scrollToEnd, toast } from '../ui.js';
import { formatTime } from '../lib/util.js';

export function createChatView(ctx) {
  const title = h('div', { class: 'name' });
  const sub = h('div', { class: 'sub' });
  const log = h('div', { class: 'log' });
  const input = h('input', { placeholder: 'Message', maxlength: 2000, autocomplete: 'off' });
  const callBtn = h('button', { class: 'btn small', onclick: () => ctx.state.chatWith && ctx.callFriend(ctx.state.chatWith) }, 'Call');
  const back = h('button', { class: 'btn small ghost back', onclick: () => ctx.openChat(null) }, 'Back');
  const placeholder = h('div', { class: 'placeholder' }, h('span', { class: 'logo big dim' }), h('p', { class: 'muted' }, 'Select a friend to start chatting'));
  const note = h('p', { class: 'notice' }, 'Messages are temporary: they live in memory only and disappear when you close the app.');
  const panel = h('div', { class: 'chat' },
    h('header', { class: 'chat-head' }, back, h('div', { class: 'grow' }, title, sub), callBtn),
    note, log,
    h('form', { class: 'compose', onsubmit: send }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Send')));
  const el = h('div', { class: 'pane-chat' }, placeholder, panel);

  async function send(e) {
    e.preventDefault();
    const fid = ctx.state.chatWith;
    const text = input.value.trim();
    if (!fid || !text) return;
    if (ctx.hub.statusOf(fid) === 'offline') return toast('Friend is offline. Messages are not stored.', 'error');
    try {
      await ctx.hub.sendMessage(fid, text);
      input.value = '';
      ctx.pushMessage(fid, { id: `me${Date.now()}`, self: true, text, ts: Date.now() });
    } catch (ex) { toast(ex.message, 'error'); }
  }

  function renderLog() {
    const fid = ctx.state.chatWith;
    clear(log);
    for (const m of ctx.chats.get(fid) || []) {
      log.append(h('div', { class: `msg ${m.self ? 'self' : ''}` },
        h('div', { class: 'bubble' }, m.text), h('div', { class: 'time' }, formatTime(m.ts))));
    }
    scrollToEnd(log);
  }

  function render() {
    const fid = ctx.state.chatWith;
    const f = ctx.state.friends.find((x) => x.id === fid);
    placeholder.hidden = !!f;
    panel.hidden = !f;
    if (!f) return;
    title.textContent = f.display;
    const st = ctx.hub.statusOf(fid);
    sub.textContent = st === 'offline' ? 'Offline' : st === 'dnd' ? 'Do not disturb' : st[0].toUpperCase() + st.slice(1);
    callBtn.disabled = st === 'offline';
    renderLog();
  }

  return { el, render, renderLog, focus: () => input.focus() };
}
