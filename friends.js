import { h, clear, avatar, toast } from '../ui.js';
import { sendRequest, acceptRequest, removeFriendship } from '../services/friends.js';

const LABEL = { online: 'Online', away: 'Away', dnd: 'Do not disturb', offline: 'Offline' };

export function createFriendsView(ctx) {
  const input = h('input', { placeholder: 'Add a friend by username', maxlength: 20, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  const requests = h('div');
  const list = h('div', { class: 'list' });

  async function add(e) {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    try {
      const r = await sendRequest(name);
      toast(r === 'accepted' ? `You and ${name} are now friends` : `Request sent to ${name}`);
      input.value = '';
      ctx.refreshFriends();
    } catch (ex) { toast(ex.message, 'error'); }
  }

  async function run(fn) {
    try { await fn(); ctx.refreshFriends(); } catch (ex) { toast(ex.message, 'error'); }
  }

  function statusDot(st) { return h('span', { class: `dot ${st}`, title: LABEL[st] || st }); }

  function render() {
    const { friends, incoming, outgoing } = ctx.state;
    clear(requests);
    if (incoming.length) {
      requests.append(h('h3', null, `Requests (${incoming.length})`));
      incoming.forEach((r) => requests.append(h('div', { class: 'row' },
        avatar(r.display),
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.display), h('div', { class: 'sub' }, `@${r.username}`)),
        h('button', { class: 'btn small primary', onclick: () => run(() => acceptRequest(r.rowId)) }, 'Accept'),
        h('button', { class: 'btn small', onclick: () => run(() => removeFriendship(r.rowId)) }, 'Decline'))));
    }
    if (outgoing.length) {
      requests.append(h('h3', null, 'Sent'));
      outgoing.forEach((r) => requests.append(h('div', { class: 'row' },
        avatar(r.display),
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.display), h('div', { class: 'sub' }, 'Waiting for reply')),
        h('button', { class: 'btn small', onclick: () => run(() => removeFriendship(r.rowId)) }, 'Cancel'))));
    }

    clear(list);
    list.append(h('h3', null, `Friends (${friends.length})`));
    if (!friends.length) {
      list.append(h('p', { class: 'empty' }, 'No friends yet. Add someone by username to chat and call.'));
      return;
    }
    const rank = { online: 0, dnd: 1, away: 2, offline: 3 };
    const sorted = [...friends].sort((a, b) =>
      (rank[ctx.hub.statusOf(a.id)] ?? 3) - (rank[ctx.hub.statusOf(b.id)] ?? 3) || a.display.localeCompare(b.display));
    for (const f of sorted) {
      const st = ctx.hub.statusOf(f.id);
      const unread = ctx.unread.get(f.id) || 0;
      list.append(h('div', { class: `row clickable ${ctx.state.chatWith === f.id ? 'active' : ''}`, onclick: () => ctx.openChat(f.id) },
        avatar(f.display),
        h('div', { class: 'grow' },
          h('div', { class: 'name' }, f.display, unread ? h('span', { class: 'badge' }, unread) : null),
          h('div', { class: 'sub' }, statusDot(st), ` ${LABEL[st] || st}`)),
        h('button', { class: 'btn small', title: 'Voice call', disabled: st === 'offline',
          onclick: (e) => { e.stopPropagation(); ctx.callFriend(f.id); } }, 'Call'),
        h('button', { class: 'btn small ghost', title: 'Remove friend',
          onclick: (e) => { e.stopPropagation(); if (confirm(`Remove ${f.display} from your friends?`)) run(() => removeFriendship(f.rowId)); } }, 'Remove')));
    }
  }

  const el = h('div', { class: 'pane-list' },
    h('form', { class: 'add', onsubmit: add }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Add')),
    requests, list);
  return { el, render };
}
