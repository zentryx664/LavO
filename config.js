const KEY = 'lavo.server';
const env = import.meta.env || {};

export function getConfig() {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY, baked: true };
  }
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c?.url && c?.key) return { ...c, baked: false };
  } catch { /* ignore */ }
  return null;
}
export const saveConfig = (c) => localStorage.setItem(KEY, JSON.stringify({ url: c.url, key: c.key }));
export const clearConfig = () => localStorage.removeItem(KEY);

export function iceServers() {
  const list = [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
  ];
  if (env.VITE_TURN_URL) {
    list.push({
      urls: env.VITE_TURN_URL,
      username: env.VITE_TURN_USERNAME || undefined,
      credential: env.VITE_TURN_CREDENTIAL || undefined,
    });
  }
  return list;
}

export const isAndroid = () => /Android/i.test(navigator.userAgent);
