-- SPATS classroom collaboration prototype. Run in Supabase SQL Editor.
create table if not exists public.sessions(code text primary key check(code ~ '^[A-Z0-9]{6}$'),title text not null default 'SPATS Club Session',created_at timestamptz not null default now());
create table if not exists public.submissions(id uuid primary key default gen_random_uuid(),session_code text not null references public.sessions(code) on delete cascade,member_id uuid not null,nickname text not null check(length(nickname) between 1 and 35),talent int not null check(talent between 0 and 100),performance int not null check(performance between 0 and 100),continuity int not null check(continuity between 0 and 100),created_at timestamptz not null default now(),unique(session_code,member_id),check(talent+performance+continuity=100));
create table if not exists public.votes(session_code text not null references public.sessions(code) on delete cascade,voter_id uuid not null,submission_id uuid not null references public.submissions(id) on delete cascade,created_at timestamptz not null default now(),primary key(session_code,voter_id));
create index if not exists submissions_session_idx on public.submissions(session_code);
create index if not exists votes_session_idx on public.votes(session_code);
alter table public.sessions enable row level security;
alter table public.submissions enable row level security;
alter table public.votes enable row level security;
create policy "read sessions" on public.sessions for select to anon using(true);
create policy "create sessions" on public.sessions for insert to anon with check(true);
create policy "read submissions" on public.submissions for select to anon using(true);
create policy "submit models" on public.submissions for insert to anon with check(true);
create policy "update models" on public.submissions for update to anon using(true) with check(true);
create policy "read votes" on public.votes for select to anon using(true);
create policy "cast votes" on public.votes for insert to anon with check(true);
create policy "change votes" on public.votes for update to anon using(true) with check(true);
-- These write policies are intentionally permissive for a trusted club demonstration only.
-- Add Supabase Auth and per-user ownership checks before public launch.
