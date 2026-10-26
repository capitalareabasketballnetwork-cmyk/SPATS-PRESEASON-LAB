-- NFL club competition (run separately from the legacy classroom schema).
-- Requires Supabase Auth; never use the old anonymous classroom policies for these tables.
create table if not exists public.nfl_clubs (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(name) between 2 and 80),
 invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6,12}$'),
 owner_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.nfl_club_members (
 club_id uuid not null references public.nfl_clubs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null check (length(display_name) between 1 and 40),
 joined_at timestamptz not null default now(),
 primary key (club_id,user_id)
);
create table if not exists public.nfl_club_models (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null,
 user_id uuid not null,
 source_model_id text not null,
 name text not null,
 model_snapshot jsonb not null check (jsonb_typeof(model_snapshot)='object'),
 version integer not null default 1,
 active_from timestamptz not null default now(),
 retired_at timestamptz,
 foreign key (club_id,user_id) references public.nfl_club_members(club_id,user_id)
);
create unique index if not exists nfl_one_active_model_per_member on public.nfl_club_models(club_id,user_id) where retired_at is null;
create table if not exists public.nfl_club_games (
 game_id text primary key,
 season integer not null,
 week integer not null,
 kickoff_at timestamptz not null,
 home_team text not null,
 away_team text not null,
 home_score integer,
 away_score integer,
 status text not null default 'scheduled'
);
create table if not exists public.nfl_club_picks (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.nfl_clubs(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 model_id uuid not null references public.nfl_club_models(id),
 game_id text not null references public.nfl_club_games(game_id),
 predicted_winner text not null,
 confidence numeric,
 generated_at timestamptz not null default now(),
 locked_at timestamptz not null,
 result text check (result in ('win','loss','tie','void') or result is null),
 unique(club_id,user_id,game_id)
);
create index if not exists nfl_picks_club_game on public.nfl_club_picks(club_id,game_id);
alter table public.nfl_clubs enable row level security;
alter table public.nfl_club_members enable row level security;
alter table public.nfl_club_models enable row level security;
alter table public.nfl_club_games enable row level security;
alter table public.nfl_club_picks enable row level security;
-- SECURITY: membership is granted only through a server-side join endpoint that
-- validates invite codes. Do not expose an insert policy allowing arbitrary joins.
create policy "clubs visible to members" on public.nfl_clubs for select to authenticated using (owner_id=auth.uid() or exists(select 1 from public.nfl_club_members m where m.club_id=id and m.user_id=auth.uid()));
create policy "members see same club" on public.nfl_club_members for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.nfl_clubs c where c.id=club_id and c.owner_id=auth.uid()));
create policy "members see model metadata" on public.nfl_club_models for select to authenticated using (exists(select 1 from public.nfl_club_members m where m.club_id=nfl_club_models.club_id and m.user_id=auth.uid()));
create policy "members see games" on public.nfl_club_games for select to authenticated using(true);
-- Pick access: own picks anytime; opponents' picks only after that game's kickoff.
create policy "locked opponent picks" on public.nfl_club_picks for select to authenticated using (
 user_id=auth.uid() or
 (exists(select 1 from public.nfl_club_members m where m.club_id=nfl_club_picks.club_id and m.user_id=auth.uid())
 and exists(select 1 from public.nfl_club_games g where g.game_id=nfl_club_picks.game_id and g.kickoff_at<=now()))
);
-- Writes to models, picks, games and results must go through authenticated
-- server-side actions with explicit ownership and kickoff checks.

-- Safe RPCs: invoker must be logged in; writes are owned by the caller.
create or replace function public.nfl_create_club(p_name text,p_display_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_code text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if length(trim(p_name)) not between 2 and 80 or length(trim(p_display_name)) not between 1 and 40 then raise exception 'Invalid name'; end if;
 loop
  v_code:=upper(substr(encode(gen_random_bytes(8),'hex'),1,8));
  begin
   insert into public.nfl_clubs(name,invite_code,owner_id) values(trim(p_name),v_code,auth.uid()) returning id into v_id;
   exit;
  exception when unique_violation then continue;
  end;
 end loop;
 insert into public.nfl_club_members(club_id,user_id,display_name) values(v_id,auth.uid(),trim(p_display_name));
 return v_id;
end $$;
create or replace function public.nfl_join_club(p_code text,p_display_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if length(trim(p_display_name)) not between 1 and 40 then raise exception 'Invalid display name'; end if;
 select id into v_id from public.nfl_clubs where invite_code=upper(trim(p_code));
 if v_id is null then raise exception 'Invalid invitation code'; end if;
 insert into public.nfl_club_members(club_id,user_id,display_name) values(v_id,auth.uid(),trim(p_display_name))
 on conflict(club_id,user_id) do nothing;
 return v_id;
end $$;
create or replace function public.nfl_submit_model(p_club_id uuid,p_source_model_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_model jsonb; v_id uuid; v_version int;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if not exists(select 1 from public.nfl_club_members where club_id=p_club_id and user_id=auth.uid()) then raise exception 'Not a club member'; end if;
 -- Read the exact saved model from the user's own NFL Model Lab record.
 select model_data into v_model from public.football_saved_models
 where user_id=auth.uid() and name=p_source_model_name;
 if v_model is null or jsonb_typeof(v_model->'weights')<>'object' then raise exception 'Saved NFL model not found or invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_club_id::text||auth.uid()::text,0));
 select coalesce(max(version),0)+1 into v_version from public.nfl_club_models where club_id=p_club_id and user_id=auth.uid();
 update public.nfl_club_models set retired_at=now() where club_id=p_club_id and user_id=auth.uid() and retired_at is null;
 insert into public.nfl_club_models(club_id,user_id,source_model_id,name,model_snapshot,version)
 values(p_club_id,auth.uid(),p_source_model_name,p_source_model_name,v_model,v_version) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.nfl_create_club(text,text) from public,anon;
revoke all on function public.nfl_join_club(text,text) from public,anon;
revoke all on function public.nfl_submit_model(uuid,text) from public,anon;
grant execute on function public.nfl_create_club(text,text) to authenticated;
grant execute on function public.nfl_join_club(text,text) to authenticated;
grant execute on function public.nfl_submit_model(uuid,text) to authenticated;
