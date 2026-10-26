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
