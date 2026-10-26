-- Install after nfl-club-week-picks.sql.
-- Returns aggregate league selections only after caller has submitted all games for the week.
create or replace function public.nfl_week_pick_percentages(p_club_id uuid,p_week integer)
returns table(game_id text,home_team text,away_team text,home_picks bigint,away_picks bigint,total_picks bigint)
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_total integer; v_mine integer;
begin
 if v_uid is null or not exists(select 1 from public.nfl_club_members m where m.club_id=p_club_id and m.user_id=v_uid)
 then raise exception 'League membership required'; end if;
 select count(*) into v_total from public.nfl_club_games g where g.season=2026 and g.week=p_week;
 select count(*) into v_mine from public.nfl_club_picks p join public.nfl_club_games g on g.game_id=p.game_id
 where p.club_id=p_club_id and p.user_id=v_uid and g.season=2026 and g.week=p_week;
 if v_total=0 or v_mine<>v_total then raise exception 'Submit all weekly picks to see league percentages'; end if;
 return query select g.game_id,g.home_team,g.away_team,
 count(p.id) filter(where p.predicted_winner=g.home_team),
 count(p.id) filter(where p.predicted_winner=g.away_team),
 count(p.id)
 from public.nfl_club_games g
 left join public.nfl_club_picks p on p.game_id=g.game_id and p.club_id=p_club_id
 where g.season=2026 and g.week=p_week
 group by g.game_id,g.home_team,g.away_team,g.kickoff_at order by g.kickoff_at,g.game_id;
end $$;
revoke all on function public.nfl_week_pick_percentages(uuid,integer) from public,anon;
grant execute on function public.nfl_week_pick_percentages(uuid,integer) to authenticated;
