import { h, logo, avatar, toast } from '../ui.js';
import { sb } from '../supabase.js';
import { DirectHub } from '../services/direct.js';
import { Room } from '../services/room.js';
import { loadFriendships, watchFriendships } from '../services/friends.js';
import { signOut } from '../services/auth.js';
import { newPrivateCode, trimHistory } from '../lib/util.js';
import { createFriendsView } from './friends.js';
import { createChatView } from './chat.js';
import { createRoomView } from './room.js';
import { createSettingsView } from './settings.js';

const CALL_RING_MS = 30000;

export function mountApp({ root, user, profile, settings }) {
  const me = { id: user.id, name: profile.username, display: profile.display_name || profile.username };
  const hub = new DirectHub(me.id);
  hub.status = settings.get().status;

  // Everything below lives in memory only and is wiped on logout / app close.
  const ctx = {
    me, hub, settings,
    state: { friends: [], incoming: [], outgoing: [], chatWith: null, tab: 'friends' },
    chats: new Map(),
    unread: new Map(),
    room: null, roomTitle: 'Room', roomLog: [],
    call: null, // { friendId, code, hadPeer, timer }
  };

  // ---------- views ----------
  const friendsView = createFriendsView(ctx);
  const chatView = createChatView(ctx);
  const roomView = createRoomView(ctx);
  const settingsView = createSettingsView(ctx);

  const split = h('div', { class: 'split', 'data-open': '0' }, friendsView.el, chatView.el);
  const views = { friends: split, rooms: roomView.el, settings: settingsView.el };

  const navBtns = {};
  const nav = h('nav', { class: 'nav' });
  for (const [id, label] of [['friends', 'Friends'], ['rooms', 'Rooms'], ['settings', 'Settings']]) {
    navBtns[id] = h('button', { class: 'nav-btn', onclick: () => setTab(id) }, label, h('span', { class: 'badge hidden', 'data-for': id }));
    nav.append(navBtns[id]);
  }
  const meName = h('div', { class: 'name' }, me.display);
  const meBox = h('div', { class: 'me' }, avatar(me.name), h('div', { class: 'grow' }, meName, h('div', { class: 'sub' }, `@${me.name}`)));
  const side = h('aside', { class: 'side' }, h('div', { class: 'brand' }, logo(), h('span', { class: 'wordmark' }, 'LavO')), nav, meBox);

  const voiceText = h('span', { class: 'grow' });
  const voiceBar = h('div', { class: 'voicebar', hidden: true },
    h('span', { class: 'dot online' }), voiceText,
    h('button', { class: 'btn small', onclick: () => setTab('rooms') }, 'Open'),
    h('button', { class: 'btn small danger', onclick: () => leaveRoom() }, 'Leave'));
  const content = h('main', { class: 'main' }, voiceBar, ...Object.values(views));
  const modalHost = h('div', { class: 'modal-host' });
  root.replaceChildren(h('div', { class: 'shell' }, side, content), modalHost);

  // ---------- navigation ----------
  function setTab(tab) {
    ctx.state.tab = tab;
    for (const [id, el] of Object.entries(views)) el.hidden = id !== tab;
    for (const [id, b] of Object.entries(navBtns)) b.classList.toggle('active', id === tab);
    if (tab === 'rooms') roomView.render();
  }

  ctx.refreshMe = () => { meName.textContent = me.display; };

  ctx.openChat = (id) => {
    ctx.state.chatWith = id;
    split.dataset.open = id ? '1' : '0';
    if (id) { ctx.unread.delete(id); updateBadges(); }
    chatView.render(); friendsView.render();
    if (id) chatView.focus();
  };

  function updateBadges() {
    const total = [...ctx.unread.values()].reduce((a, b) => a + b, 0);
    const b = nav.querySelector('[data-for="friends"]');
    b.textContent = total; b.classList.toggle('hidden', !total);
  }

  // ---------- friends ----------
  let refreshing = false;
  ctx.refreshFriends = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const data = await loadFriendships(me.id);
      Object.assign(ctx.state, data);
      hub.syncFriends(data.friends.map((f) => f.id));
      if (ctx.state.chatWith && !data.friends.some((f) => f.id === ctx.state.chatWith)) ctx.openChat(null);
      friendsView.render(); chatView.render();
    } catch (e) { toast(e.message, 'error'); } finally { refreshing = false; }
  };
  const stopWatch = watchFriendships(me.id, () => ctx.refreshFriends());

  // ---------- direct messages ----------
  ctx.pushMessage = (fid, msg) => {
    const list = trimHistory([...(ctx.chats.get(fid) || []), msg]);
    ctx.chats.set(fid, list);
    if (ctx.state.chatWith === fid) chatView.renderLog();
  };
  hub.on('message', (m) => {
    ctx.pushMessage(m.from, { id: m.id, text: m.text, ts: m.ts });
    if (!(ctx.state.tab === 'friends' && ctx.state.chatWith === m.from)) {
      ctx.unread.set(m.from, (ctx.unread.get(m.from) || 0) + 1);
      updateBadges(); friendsView.render();
    }
  });
  hub.on('presence', () => { friendsView.render(); chatView.render(); });

  // ---------- rooms & voice ----------
  ctx.pushRoomMessage = (msg) => {
    ctx.roomLog = trimHistory([...ctx.roomLog, msg]);
    roomView.renderLog();
  };

  function updateVoiceBar() {
    const r = ctx.room;
    voiceBar.hidden = !r;
    if (r) voiceText.textContent = `${ctx.roomTitle} - ${r.voice ? 'in voice' : 'text only'}`;
  }

  ctx.joinRoom = async (code, { title = 'Room', voice = false } = {}) => {
    if (ctx.room) await leaveRoom();
    const room = new Room({ code, me: { id: me.id, name: me.display }, getSettings: settings.get });
    ctx.room = room; ctx.roomTitle = title; ctx.roomLog = [];
    room.on('message', (m) => ctx.pushRoomMessage(m));
    room.on('peers', (list) => {
      roomView.renderPeers();
      if (ctx.call) {
        if (list.length) { ctx.call.hadPeer = true; clearTimeout(ctx.call.timer); }
        else if (ctx.call.hadPeer) setTimeout(() => { if (ctx.call && ctx.room === room && !room.peerList().length) leaveRoom(); }, 1500);
      }
    });
    room.on('voice', () => { roomView.renderControls(); roomView.renderPeers(); updateVoiceBar(); });
    room.on('stats', (s) => roomView.renderStats(s));
    room.on('error', (e) => toast(e.message, 'error'));
    try {
      await room.join();
    } catch (e) {
      ctx.room = null; roomView.render(); updateVoiceBar();
      toast(e.message, 'error');
      return false;
    }
    setTab('rooms'); roomView.render(); updateVoiceBar();
    if (voice) {
      try { await room.enableVoice(); } catch (e) { toast(e.message, 'error'); }
    }
    return true;
  };

  async function leaveRoom() {
    const r = ctx.room;
    if (!r) return;
    if (ctx.call) { clearTimeout(ctx.call.timer); }
    ctx.room = null; ctx.call = null; ctx.roomLog = [];
    updateVoiceBar(); roomView.render();
    await r.leave().catch(() => {});
  }
  ctx.leaveRoom = leaveRoom;

  // ---------- private calls ----------
  ctx.callFriend = async (fid) => {
    const f = ctx.state.friends.find((x) => x.id === fid);
    if (!f) return;
    if (hub.statusOf(fid) === 'offline') return toast(`${f.display} is offline`, 'error');
    if (ctx.room && !confirm('Leave your current room to start a call?')) return;
    const code = newPrivateCode();
    const ok = await ctx.joinRoom(code, { title: `Call with ${f.display}`, voice: true });
    if (!ok) return;
    ctx.call = { friendId: fid, code, hadPeer: false, timer: null };
    try { await hub.sendCall(fid, 'invite', code); }
    catch (e) { toast(e.message, 'error'); await leaveRoom(); return; }
    toast(`Calling ${f.display}...`);
    ctx.call.timer = setTimeout(async () => {
      if (ctx.call && !ctx.call.hadPeer) {
        hub.sendCall(fid, 'cancel', code).catch(() => {});
        toast(`${f.display} did not answer`);
        await leaveRoom();
      }
    }, CALL_RING_MS);
  };

  let incoming = null; // { from, code, timer, close }
  function closeIncoming() {
    if (!incoming) return;
    clearTimeout(incoming.timer);
    modalHost.replaceChildren();
    incoming = null;
  }

  hub.on('call', ({ from, kind, code }) => {
    const f = ctx.state.friends.find((x) => x.id === from);
    if (!f) return;
    if (kind === 'invite') {
      if (settings.get().status === 'dnd' || incoming || ctx.call) {
        hub.sendCall(from, 'decline', code).catch(() => {});
        return;
      }
      const accept = async () => {
        closeIncoming();
        ctx.openChat(null);
        const ok = await ctx.joinRoom(code, { title: `Call with ${f.display}`, voice: true });
        if (ok) ctx.call = { friendId: from, code, hadPeer: false, timer: null };
      };
      const decline = () => { closeIncoming(); hub.sendCall(from, 'decline', code).catch(() => {}); };
      modalHost.replaceChildren(h('div', { class: 'modal', role: 'alertdialog', 'aria-label': 'Incoming call' },
        h('div', { class: 'modal-box' },
          avatar(f.display), h('h2', null, f.display), h('p', { class: 'muted' }, 'Incoming voice call'),
          h('div', { class: 'controls' },
            h('button', { class: 'btn primary', onclick: accept }, 'Accept'),
            h('button', { class: 'btn danger', onclick: decline }, 'Decline')))));
      incoming = { from, code, timer: setTimeout(closeIncoming, CALL_RING_MS + 2000) };
    } else if (kind === 'cancel' && incoming && incoming.code === code) {
      closeIncoming();
    } else if (kind === 'decline' && ctx.call && ctx.call.code === code) {
      toast(`${f.display} declined the call`);
      leaveRoom();
    }
  });

  // ---------- performance mode ----------
  ctx.applyPerf = () => document.body.classList.toggle('perf', !!settings.get().performanceMode);
  ctx.applyPerf();

  // ---------- logout / teardown ----------
  let tornDown = false;
  async function teardown() {
    if (tornDown) return;
    tornDown = true;
    window.removeEventListener('pagehide', onHide);
    closeIncoming();
    stopWatch();
    await leaveRoom();
    hub.destroy();
    ctx.chats.clear(); ctx.unread.clear(); ctx.roomLog = [];
    await settings.detach();
  }
  const onHide = () => { teardown(); };
  window.addEventListener('pagehide', onHide);

  ctx.logout = async () => { await teardown(); await signOut(); };

  // ---------- go ----------
  setTab('friends');
  chatView.render();
  ctx.refreshFriends();

  return { destroy: teardown };
}
