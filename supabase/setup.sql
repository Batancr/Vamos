-- Vamos online: accounts, ranked daily trips and 1v1 matches.
-- Paste all of this into Supabase → SQL Editor → New query, then press Run. Running it twice is safe.
-- Security model: anyone may read (leaderboards and the lobby are public); people may only write their own rows,
-- and match updates go through the functions at the bottom, which check whose turn it is.

-- Works whether or not "Automatically expose new tables" is on: every grant the game needs is listed here.
grant usage on schema public to anon, authenticated;

-- ---------- profiles: one per account ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  progress jsonb not null default '{}'::jsonb check (pg_column_size(progress) < 30000),
  char text not null default 'none' check (length(char) <= 16),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));
alter table public.profiles enable row level security;
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Usernames are picked at sign-up and can't be changed by the player; only progress and character can.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (progress, char) on public.profiles to authenticated;

-- A profile is made automatically when someone signs up, from the username they typed.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username) values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.username_free(name text) returns boolean
language sql stable set search_path = '' as $$
  select name ~ '^[A-Za-z0-9_]{3,16}$' and not exists (select 1 from public.profiles where lower(username) = lower(name))
$$;
grant execute on function public.username_free(text) to anon, authenticated;

-- ---------- ranked: one counted try per player per daily trip ----------
create table if not exists public.runs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day int not null check (day between 1 and 100000),
  char text not null check (length(char) <= 16),
  hours real not null check (hours > 0 and hours < 1000000),
  best real not null check (best > 0 and best < 1000000),
  points int generated always as (least(1000, round(1000 * best / hours))::int) stored,
  route text check (length(route) <= 8000),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.runs enable row level security;
drop policy if exists "runs are public" on public.runs;
create policy "runs are public" on public.runs for select using (true);
drop policy if exists "add own run" on public.runs;
create policy "add own run" on public.runs for insert to authenticated with check (user_id = auth.uid());
-- Routes stay private, so nobody can copy today's ranked route before playing.
revoke select, insert, update, delete on public.runs from anon, authenticated;
grant select (id, user_id, day, char, hours, best, points, created_at) on public.runs to anon, authenticated;
grant insert (day, char, hours, best, route) on public.runs to authenticated;

create or replace view public.leaderboard with (security_invoker = true) as
  select p.username, sum(r.points)::int as points, count(*)::int as trips, max(r.day) as last_day
  from public.runs r join public.profiles p on p.id = r.user_id
  group by p.username;
grant select on public.leaderboard to anon, authenticated;

-- ---------- 1v1 matches: post to the lobby or invite a player ----------
create table if not exists public.matches (
  id bigint generated always as identity primary key,
  host uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  invited uuid references public.profiles (id) on delete cascade,
  guest uuid references public.profiles (id) on delete cascade,
  trip jsonb not null check (pg_column_size(trip) < 2000),
  status text not null default 'open' check (status in ('open', 'playing', 'done', 'cancelled')),
  host_hours real, host_route text, host_char text,
  guest_hours real, guest_route text, guest_char text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists matches_status on public.matches (status, created_at desc);
alter table public.matches enable row level security;
drop policy if exists "matches are public" on public.matches;
create policy "matches are public" on public.matches for select using (true);
drop policy if exists "post a match" on public.matches;
create policy "post a match" on public.matches for insert to authenticated with check (
  host = auth.uid() and (invited is null or invited <> auth.uid())
  and (select count(*) from public.matches m where m.host = auth.uid() and m.status = 'open') < 5);
-- Routes are only shown once both players have finished (see match_routes).
revoke select, insert, update, delete on public.matches from anon, authenticated;
grant select (id, host, invited, guest, trip, status, host_hours, host_char, guest_hours, guest_char, created_at, finished_at)
  on public.matches to anon, authenticated;
grant insert (invited, trip) on public.matches to authenticated;

drop function if exists public.accept_match(bigint);
drop function if exists public.submit_match(bigint, real, text, text);
-- These return only the match id or status, never the other player's route.
create or replace function public.accept_match(match_id bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  update public.matches set guest = auth.uid(), status = 'playing'
  where id = match_id and status = 'open' and host <> auth.uid() and (invited is null or invited = auth.uid())
  returning * into m;
  if m.id is null then raise exception 'This match is no longer open'; end if;
  return m.id;
end $$;

create or replace function public.submit_match(match_id bigint, hours real, route text, ch text) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  if hours is null or hours <= 0 or hours >= 1000000 or length(route) > 8000 or length(ch) > 16 then raise exception 'Bad result'; end if;
  update public.matches set host_hours = hours, host_route = route, host_char = ch
    where id = match_id and host = auth.uid() and host_hours is null and status in ('open', 'playing') returning * into m;
  if m.id is null then
    update public.matches set guest_hours = hours, guest_route = route, guest_char = ch
      where id = match_id and guest = auth.uid() and guest_hours is null and status = 'playing' returning * into m;
  end if;
  if m.id is null then raise exception 'You can''t send a time for this match'; end if;
  if m.host_hours is not null and m.guest_hours is not null then
    update public.matches set status = 'done', finished_at = now() where id = m.id returning * into m;
  end if;
  return m.status;
end $$;

create or replace function public.cancel_match(match_id bigint) returns void
language sql security definer set search_path = '' as $$
  update public.matches set status = 'cancelled' where id = match_id and host = auth.uid() and status = 'open'
$$;
create or replace function public.match_routes(match_id bigint) returns table (host_route text, guest_route text)
language sql stable security definer set search_path = '' as $$
  select host_route, guest_route from public.matches where id = match_id and status = 'done'
$$;
grant execute on function public.match_routes(bigint) to anon, authenticated;

revoke execute on function public.accept_match(bigint), public.submit_match(bigint, real, text, text), public.cancel_match(bigint) from public, anon;
grant execute on function public.accept_match(bigint), public.submit_match(bigint, real, text, text), public.cancel_match(bigint) to authenticated;
