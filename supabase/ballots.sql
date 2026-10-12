create table if not exists public.ballots (id uuid primary key default gen_random_uuid(), session_code text not null references public.sessions(code), member_id uuid not null, nickname text not null, rankings jsonb not null, unique(session_code,member_id));
alter table public.ballots enable row level security;
create policy "read ballots" on public.ballots for select to anon using (true);
create policy "insert ballots" on public.ballots for insert to anon with check (true);
create policy "update ballots" on public.ballots for update to anon using (true) with check (true);
