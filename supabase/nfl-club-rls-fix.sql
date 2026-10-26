-- Run after nfl-club.sql. Fix cross-table RLS recursion and allow members
-- to see other members in their club without exposing nonmember records.
create or replace function public.nfl_is_club_member(p_club_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.nfl_club_members where club_id=p_club_id and user_id=auth.uid()) $$;
revoke all on function public.nfl_is_club_member(uuid) from public,anon;
grant execute on function public.nfl_is_club_member(uuid) to authenticated;
drop policy if exists "clubs visible to members" on public.nfl_clubs;
create policy "clubs visible to members" on public.nfl_clubs for select to authenticated
using (owner_id=auth.uid() or public.nfl_is_club_member(id));
drop policy if exists "members see same club" on public.nfl_club_members;
create policy "members see same club" on public.nfl_club_members for select to authenticated
using (public.nfl_is_club_member(club_id));
drop policy if exists "members see model metadata" on public.nfl_club_models;
create policy "members see model metadata" on public.nfl_club_models for select to authenticated
using (public.nfl_is_club_member(club_id));
drop policy if exists "locked opponent picks" on public.nfl_club_picks;
create policy "locked opponent picks" on public.nfl_club_picks for select to authenticated
using (user_id=auth.uid() or
 (public.nfl_is_club_member(club_id) and exists
 (select 1 from public.nfl_club_games g where g.game_id=nfl_club_picks.game_id and g.kickoff_at<=now())));
