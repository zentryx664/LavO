export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/1/I/O
export const MAX_TEXT = 2000;
export const MAX_HISTORY = 200; // in-memory only, per conversation

export const validUsername = (u) => USERNAME_RE.test(u || '');
export const validPassword = (p) => typeof p === 'string' && p.length >= 8;
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

export function randomString(len, alphabet = ROOM_ALPHABET) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (const n of buf) out += alphabet[n % alphabet.length];
  return out;
}
export const newRoomCode = () => randomString(8);
export const newPrivateCode = () => randomString(24);
export const normalizeRoomCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const validRoomCode = (c) => /^[A-HJ-NP-Z2-9]{6,32}$/.test(c || '');

export const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/** Both users compute the same topic regardless of who opens it. */
export function pairTopic(a, b) {
  const [x, y] = [a, b].sort();
  return `dm:${x}:${y}`;
}

/** Deterministic WebRTC offerer so two peers never send offers at each other (no glare). */
export const isInitiator = (me, peer) => me < peer;

export const clampText = (t, max = MAX_TEXT) => String(t ?? '').slice(0, max);

export function trimHistory(list, max = MAX_HISTORY) {
  return list.length > max ? list.slice(list.length - max) : list;
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
