import { sb } from '../supabase.js';
import { emitter } from '../lib/emitter.js';
import { pairTopic, makeId, clampText } from '../lib/util.js';

/**
 * One private Realtime channel per friend pair (dm:<a>:<b>).
 * It carries presence (online status), direct messages and call signalling.
 * Nothing is stored: if the friend is offline the message is simply not sent.
 */
export class DirectHub {
  constructor(myId) {
    this.me = myId;
    this.entries = new Map(); // friendId -> { ch, ready }
    this.presence = new Map(); // friendId -> status
    this.status = 'online';
    this.ev = emitter();
  }

  on(event, fn) { return this.ev.on(event, fn); }
  statusOf(id) { return this.presence.get(id) || 'offline'; }

  syncFriends(ids) {
    const want = new Set(ids);
    for (const id of [...this.entries.keys()]) if (!want.has(id)) this._close(id);
    for (const id of want) if (!this.entries.has(id)) this._open(id);
  }

  _open(fid) {
    const ch = sb().channel(pairTopic(this.me, fid), {
      config: { private: true, presence: { key: this.me }, broadcast: { self: false } },
    });
    const entry = { ch, ready: false };
    this.entries.set(fid, entry);

    ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
      if (!payload) return;
      this.ev.emit('message', { from: fid, id: String(payload.id || makeId()), text: clampText(payload.text), ts: Date.now() });
    });
    ch.on('broadcast', { event: 'call' }, ({ payload }) => {
      if (!payload || typeof payload !== 'object') return;
      this.ev.emit('call', { from: fid, kind: String(payload.kind), code: String(payload.code || '') });
    });
    ch.on('presence', { event: 'sync' }, () => {
      const metas = ch.presenceState()[fid];
      const st = metas && metas.length ? String(metas[metas.length - 1].status || 'online') : 'offline';
      if (this.presence.get(fid) !== st) {
        this.presence.set(fid, st);
        this.ev.emit('presence', { id: fid, status: st });
      }
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        entry.ready = true;
        if (this.status !== 'invisible') await ch.track({ status: this.status }).catch(() => {});
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        entry.ready = false;
      }
    });
  }

  _close(fid) {
    const e = this.entries.get(fid);
    if (!e) return;
    this.entries.delete(fid);
    this.presence.delete(fid);
    sb().removeChannel(e.ch);
  }

  async setStatus(status) {
    this.status = status;
    await Promise.all([...this.entries.values()].map((e) => (
      status === 'invisible' ? e.ch.untrack() : e.ch.track({ status })
    ).catch(() => {})));
  }

  async _send(fid, event, payload) {
    const e = this.entries.get(fid);
    if (!e || !e.ready) throw new Error('Not connected to this friend yet');
    const res = await e.ch.send({ type: 'broadcast', event, payload });
    if (res !== 'ok') throw new Error('Could not deliver');
  }

  sendMessage(fid, text) { return this._send(fid, 'msg', { id: makeId(), text: clampText(text) }); }
  sendCall(fid, kind, code) { return this._send(fid, 'call', { kind, code }); }

  destroy() {
    for (const id of [...this.entries.keys()]) this._close(id);
  }
}
