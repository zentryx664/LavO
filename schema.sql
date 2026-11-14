-- LavO database schema. Run once in Supabase: SQL Editor -> New query -> Run.
-- Persistent data ONLY: accounts/profiles, friendships, essential settings.
-- Messages and voice are never stored; they travel over Realtime Broadcast/Presence + WebRTC.

create extension if not exists citext;

-- ---------- tables ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     citext not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 32),
  created_at   timestamptz not null default now()
);

create table if not exists public.settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 4096),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id         bigint generated always as identity primary key,
  requester  uuid not null references public.profiles(id) on delete cascade,
  addressee  uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee on public.friendships (addressee);

-- ---------- new user -> profile + settings ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'username');
  insert into public.settings (user_id) values (new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- helpers / RPC ----------
create or replace function public.username_available(name text) returns boolean
language sql security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = name::citext);
$$;

create or replace function public.is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

create or replace function public.send_friend_request(target text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tid uuid;
  ex public.friendships;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select id into tid from public.profiles where username = target::citext;
  if tid is null then raise exception 'No user with that username'; end if;
  if tid = me then raise exception 'You cannot add yourself'; end if;

  select * into ex from public.friendships
   where (requester = me and addressee = tid) or (requester = tid and addressee = me);
  if found then
    if ex.status = 'accepted' then raise exception 'You are already friends'; end if;
    if ex.requester = tid then
      update public.friendships set status = 'accepted' where id = ex.id;
      return 'accepted';
    end if;
    raise exception 'Request already sent';
  end if;

  insert into public.friendships (requester, addressee) values (me, tid);
  return 'sent';
end $$;

create or replace function public.accept_friend_request(request_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.friendships set status = 'accepted'
   where id = request_id and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'Request not found'; end if;
end $$;

-- Realtime channel authorisation: who may join which topic.
--   dm:<uidA>:<uidB>  only the two users, and only while they are friends
--   room:<code>       any signed-in user who knows the (secret) code
create or replace function public.lavo_topic_ok(topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(topic, ':');
  a uuid; b uuid; me uuid := auth.uid();
begin
  if me is null then return false; end if;
  if parts[1] = 'room' then
    return array_length(parts, 1) = 2 and parts[2] ~ '^[A-HJ-NP-Z2-9]{6,32}$';
  end if;
  if parts[1] = 'dm' and array_length(parts, 1) = 3 then
    begin a := parts[2]::uuid; b := parts[3]::uuid;
    exception when others then return false; end;
    return me in (a, b) and public.is_friend(a, b);
  end if;
  return false;
end $$;

-- ---------- row level security ----------
alter table public.profiles    enable row level security;
alter table public.settings    enable row level security;
alter table public.friendships enable row level security;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant  update (display_name) on public.profiles to authenticated;

drop policy if exists settings_all on public.settings;
create policy settings_all on public.settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists friendships_read   on public.friendships;
drop policy if exists friendships_delete on public.friendships;
create policy friendships_read   on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
create policy friendships_delete on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));
-- No insert/update policies: friendships change only through the RPCs above.

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.accept_friend_request(bigint) to authenticated;
revoke execute on function public.is_friend(uuid, uuid) from anon;

-- ---------- realtime ----------
alter publication supabase_realtime add table public.friendships;

drop policy if exists lavo_realtime_read  on realtime.messages;
drop policy if exists lavo_realtime_write on realtime.messages;
create policy lavo_realtime_read  on realtime.messages for select to authenticated
  using (public.lavo_topic_ok(realtime.topic()));
create policy lavo_realtime_write on realtime.messages for insert to authenticated
  with check (public.lavo_topic_ok(realtime.topic()));
