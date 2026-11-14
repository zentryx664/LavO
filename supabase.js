import { createClient } from '@supabase/supabase-js';

let client = null;

export function initSupabase({ url, key }) {
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
export const sb = () => {
  if (!client) throw new Error('Server not configured');
  return client;
};
