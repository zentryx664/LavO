import { h, clear, avatar, scrollToEnd, toast } from '../ui.js';
import { formatTime, newRoomCode, normalizeRoomCode, validRoomCode } from '../lib/util.js';

const Q = { good: 'Good', fair: 'Fair', poor: 'Poor', unknown: '-' };

export function createRoomView(ctx) {
  // ----- lobby -----
  const codeInput = h('input', { placeholder: 'Room code', maxlength: 32, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
  const lobby = h('div', { class: 'lobby' },
    h('h2', null, 'Rooms'),
    h('p', { class: 'muted' }, 'Rooms are temporary group spaces for text and voice. Share the code with friends to let them in. Nothing is saved after everyone leaves.'),
    h('form', { class: 'add', onsubmit: (e) => { e.preventDefault(); join(codeInput.value); } },
      codeInput, h('button', { class: 'btn primary', type: 'submit' }, 'Join')),
    h('button', { class: 'btn wide', onclick: () => join(newRoomCode()) }, 'Create a new room'));

  // ----- active room -----
  const roomTitle = h('div', { class: 'name' });
  const roomSub = h('div', { class: 'sub' });
  const peersBox = h('div', { class: 'peers' });
  const log = h('div', { class: 'log' });
  const input = h('input', { placeholder: 'Message the room', maxlength: 2000, autocomplete: 'off' });
  const stats = h('div', { class: 'stats' });
  const voiceBtn = h('button', { class: 'btn primary', onclick: toggleVoice }, 'Join voice');
  const muteBtn = h('button', { class: 'btn', onclick: () => ctx.room?.setMuted(!ctx.room.muted) }, 'Mute');
  const deafBtn = h('button', { class: 'btn', onclick: () => ctx.room?.setDeafened(!ctx.room.deafened) }, 'Deafen');
  const leaveBtn = h('button', { class: 'btn danger', onclick: () => ctx.leaveRoom() }, 'Leave');
  const copyBtn = h('button', { class: 'btn small', onclick: copyCode }, 'Copy code');

  const active = h('div', { class: 'room' },
    h('header', { class: 'chat-head' }, h('div', { class: 'grow' }, roomTitle, roomSub), copyBtn),
    peersBox,
    h('div', { class: 'controls' }, voiceBtn, muteBtn, deafBtn, leaveBtn),
    stats,
    h('p', { class: 'notice' }, 'Voice is never recorded or stored. Chat is memory-only.'),
    log,
    h('form', { class: 'compose', onsubmit: send }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Send')));

  const el = h('div', { class: 'room-wrap' }, lobby, active);

  async function join(raw) {
    const code = normalizeRoomCode(raw);
    if (!validRoomCode(code)) return toast('Room codes are 6-32 letters and numbers', 'error');
    codeInput.value = '';
    await ctx.joinRoom(code, { title: 'Room' });
  }

  async function toggleVoice() {
    const r = ctx.room;
    if (!r) return;
    voiceBtn.disabled = true;
    try {
      if (r.voice) await r.disableVoice(); else await r.enableVoice();
    } catch (ex) { toast(ex.message, 'error'); }
    voiceBtn.disabled = false;
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(ctx.room.code); toast('Room code copied'); }
    catch { toast(`Room code: ${ctx.room.code}`); }
  }

  async function send(e) {
    e.preventDefault();
    const r = ctx.room;
    const text = input.value.trim();
    if (!r || !text) return;
    try {
      const msg = await r.sendChat(text);
      input.value = '';
      if (msg) ctx.pushRoomMessage({ ...msg, self: true });
    } catch (ex) { toast(ex.message, 'error'); }
  }

  function renderLog() {
    clear(log);
    for (const m of ctx.roomLog) {
      log.append(h('div', { class: `msg ${m.self ? 'self' : ''}` },
        m.self ? null : h('div', { class: 'who' }, m.name),
        h('div', { class: 'bubble' }, m.text),
        h('div', { class: 'time' }, formatTime(m.ts))));
    }
    scrollToEnd(log);
  }

  function renderPeers() {
    const r = ctx.room;
    clear(peersBox);
    if (!r) return;
    const me = { id: r.me.id, name: `${r.me.name} (you)`, voice: r.voice };
    for (const p of [me, ...r.peerList()]) {
      peersBox.append(h('div', { class: 'peer' }, avatar(p.name),
        h('span', { class: 'grow' }, p.name),
        h('span', { class: `tag ${p.voice ? 'on' : ''}` }, p.voice ? 'In voice' : 'Text')));
    }
    if (!r.peerList().length) peersBox.append(h('p', { class: 'empty' }, 'You are the only one here. Share the room code to invite friends.'));
  }

  function renderControls() {
    const r = ctx.room;
    if (!r) return;
    voiceBtn.textContent = r.voice ? 'Leave voice' : 'Join voice';
    voiceBtn.className = `btn ${r.voice ? '' : 'primary'}`;
    muteBtn.hidden = deafBtn.hidden = !r.voice;
    muteBtn.textContent = r.muted ? 'Unmute' : 'Mute';
    deafBtn.textContent = r.deafened ? 'Undeafen' : 'Deafen';
    muteBtn.classList.toggle('toggled', r.muted);
    deafBtn.classList.toggle('toggled', r.deafened);
    stats.hidden = !r.voice;
  }

  function renderStats(s) {
    clear(stats);
    if (!s) return;
    const f = (v, u, d = 0) => (v == null ? '-' : `${v.toFixed(d)} ${u}`);
    stats.append(
      h('span', null, 'Ping ', h('b', null, f(s.rtt, 'ms'))),
      h('span', null, 'Jitter ', h('b', null, f(s.jitter, 'ms'))),
      h('span', null, 'Loss ', h('b', null, f(s.loss, '%', 1))),
      h('span', { class: `q ${s.quality}` }, Q[s.quality]));
  }

  function render() {
    const r = ctx.room;
    lobby.hidden = !!r;
    active.hidden = !r;
    if (!r) return;
    roomTitle.textContent = ctx.roomTitle;
    roomSub.textContent = `Code ${r.code}`;
    renderPeers(); renderControls(); renderLog();
  }

  return { el, render, renderPeers, renderControls, renderStats, renderLog };
}
