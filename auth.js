import { sb } from '../supabase.js';
import { validUsername, validPassword, validEmail } from '../lib/util.js';

export async function signUp({ email, password, username }) {
  if (!validEmail(email)) throw new Error('Enter a valid email address');
  if (!validUsername(username)) throw new Error('Username must be 3-20 letters, numbers or underscores');
  if (!validPassword(password)) throw new Error('Password must be at least 8 characters');
  const { data: free, error: e1 } = await sb().rpc('username_available', { name: username });
  if (e1) throw e1;
  if (!free) throw new Error('That username is taken');
  const { data, error } = await sb().auth.signUp({ email, password, options: { data: { username } } });
  if (error) throw error;
  return data; // data.session is null when email confirmation is enabled
}

export async function signIn({ email, password }) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export const signOut = () => sb().auth.signOut();

export async function getUser() {
  const { data } = await sb().auth.getSession();
  return data.session?.user ?? null;
}

export async function loadProfile(uid) {
  const { data, error } = await sb().from('profiles').select('id,username,display_name').eq('id', uid).single();
  if (error) throw error;
  return data;
}

export async function updateDisplayName(uid, name) {
  const clean = String(name || '').trim().slice(0, 32) || null;
  const { error } = await sb().from('profiles').update({ display_name: clean }).eq('id', uid);
  if (error) throw error;
  return clean;
}
