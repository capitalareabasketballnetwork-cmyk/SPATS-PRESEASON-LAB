-- Run once in Supabase SQL Editor to enable editable weekly NFL picks.
-- A week locks at its FIRST scheduled kickoff (not individual game kickoff).
create or replace function public.nfl_submit_week_picks(p_club_id uuid,p_model_id uuid,p_week integer,p_picks jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_lock timestamptz; v_count integer; v_item jsonb; v_game record; v_written integer:=0;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 if not exists(select 1 from public.nfl_club_members where club_id=p_club_id and user_id=v_uid) then raise exception 'Not a league member'; end if;
 if not exists(select 1 from public.nfl_club_models where id=p_model_id and club_id=p_club_id and user_id=v_uid and retired_at is null) then raise exception 'Submit an active NFL model first'; end if;
 if p_week not between 1 and 18 then raise exception 'Invalid NFL week'; end if;
 if jsonb_typeof(p_picks)<>'array' then raise exception 'Invalid picks'; end if;
 -- Serialize submissions for this club/user/week, preventing concurrent changes around lock.
 perform pg_advisory_xact_lock(hashtextextended(p_club_id::text||v_uid::text||p_week::text,0));
 select min(kickoff_at),count(*) into v_lock,v_count from public.nfl_club_games where season=2026 and week=p_week;
 if v_lock is null or v_count=0 then raise exception 'Week schedule not loaded'; end if;
 if now()>=v_lock then raise exception 'Picks are locked: the first game of the week has started'; end if;
 if jsonb_array_length(p_picks)<>v_count then raise exception 'Submit one pick for every game in the week'; end if;
 if (select count(distinct item->>'game_id') from jsonb_array_elements(p_picks) item)<>v_count then raise exception 'Duplicate or missing games'; end if;
 for v_item in select value from jsonb_array_elements(p_picks) loop
  select game_id,home_team,away_team into v_game from public.nfl_club_games where game_id=v_item->>'game_id' and season=2026 and week=p_week;
  if not found then raise exception 'Game not in requested week'; end if;
  if (v_item->>'pick') not in (v_game.home_team,v_game.away_team) then raise exception 'Invalid NFL team selection'; end if;
  insert into public.nfl_club_picks(club_id,user_id,model_id,game_id,predicted_winner,confidence,locked_at)
  values(p_club_id,v_uid,p_model_id,v_game.game_id,v_item->>'pick',
   case when (v_item->>'confidence') ~ '^[0-9]+(\.[0-9]+)?$' then least(100,greatest(0,(v_item->>'confidence')::numeric)) else null end,v_lock)
  on conflict(club_id,user_id,game_id) do update
  set predicted_winner=excluded.predicted_winner,confidence=excluded.confidence,model_id=excluded.model_id,locked_at=excluded.locked_at
  where public.nfl_club_picks.result is null;
  v_written:=v_written+1;
 end loop;
 return v_written;
end $$;
revoke all on function public.nfl_submit_week_picks(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.nfl_submit_week_picks(uuid,uuid,integer,jsonb) to authenticated;
