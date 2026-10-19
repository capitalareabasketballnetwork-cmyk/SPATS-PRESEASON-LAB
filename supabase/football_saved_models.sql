-- Run once in Supabase SQL Editor to enable private, account-linked NFL models.
create table if not exists public.football_saved_models (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  model_data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id,name)
);
alter table public.football_saved_models enable row level security;
create policy "Owners read football models" on public.football_saved_models
  for select to authenticated using (auth.uid() = user_id);
create policy "Owners save football models" on public.football_saved_models
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Owners update football models" on public.football_saved_models
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners delete football models" on public.football_saved_models
  for delete to authenticated using (auth.uid() = user_id);
