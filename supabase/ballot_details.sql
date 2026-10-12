-- Run in the Supabase SQL Editor to enable per-ballot method and edit details.
create table if not exists public.ballot_details (
  session_code text not null references public.sessions(code) on delete cascade,
  member_id uuid not null,
  method text not null,
  starting_rankings jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (session_code, member_id)
);
alter table public.ballot_details enable row level security;
create policy "read ballot details" on public.ballot_details for select to anon using (true);
create policy "insert ballot details" on public.ballot_details for insert to anon with check (true);
create policy "update ballot details" on public.ballot_details for update to anon using (true) with check (true);
-- Anonymous policies match the existing classroom-prototype ballot policies.
