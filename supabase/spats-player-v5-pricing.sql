-- SPATS PLAYER STOCK V5 | migration prepared 2026-11-11
-- Run ONCE in Supabase SQL Editor after reviewing the preflight results.
-- Function lives in public because Vercel's scheduled job calls public.rpc('calculate_player_v5').
-- Replay is deterministic and transactional; ONLY season 2027 / formula V5
-- player ratings/history are replaced. Team stocks and Elo remain untouched.
--
-- PRECHECK (read only):
-- SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
-- WHERE table_schema='spats_market' AND table_name IN
-- ('player_games','player_seasons','player_ratings','player_price_history','games')
-- ORDER BY table_name,ordinal_position;
--
-- PREREQUISITES:
-- player_ratings: player_id,season,formula_version,opening_price,stock_price,
-- opening_quality,current_quality,expected_performance,games_processed,missed_streak,updated_at
-- player_price_history: player_id,season,game_id,formula_version,event_type,
-- price_before,price_after,change_pct,quality_before,quality_after,event_time,explanation
-- prior/current player_games: player_id,game_id,season,team_id and basketball statistics
--
CREATE OR REPLACE FUNCTION public.calculate_player_v5()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO pg_catalog, spats_market
AS $spats_v5$
DECLARE
  player record;
  game record;
  prior record;
  opening numeric;
  price numeric;
  price_before numeric;
  reference_quality numeric;
  quality numeric;
  quality_before numeric;
  expectation numeric;
  opponent_expectation numeric;
  signal numeric;
  step_pct numeric;
  player_games integer;
  players_total integer := 0;
  events_total integer := 0;
  minimum numeric := NULL;
  maximum numeric := NULL;
BEGIN
  -- An exclusive transaction advisory lock prevents simultaneous nightly/manual replays.
  PERFORM pg_catalog.pg_advisory_xact_lock(928425);

  -- Validate destination fields BEFORE any deletes or writes.
  IF EXISTS (
    WITH required(table_name,column_name) AS (
      VALUES
       ('player_ratings','player_id'),('player_ratings','season'),
       ('player_ratings','formula_version'),('player_ratings','opening_price'),
       ('player_ratings','stock_price'),('player_ratings','opening_quality'),
       ('player_ratings','current_quality'),('player_ratings','expected_performance'),
       ('player_ratings','games_processed'),('player_ratings','missed_streak'),
       ('player_ratings','updated_at'),
       ('player_price_history','player_id'),('player_price_history','season'),
       ('player_price_history','game_id'),('player_price_history','formula_version'),
       ('player_price_history','event_type'),('player_price_history','price_before'),
       ('player_price_history','price_after'),('player_price_history','change_pct'),
       ('player_price_history','quality_before'),('player_price_history','quality_after'),
       ('player_price_history','event_time'),('player_price_history','explanation')
    )
    SELECT 1 FROM required r
    LEFT JOIN information_schema.columns c
      ON c.table_schema='spats_market' AND c.table_name=r.table_name
      AND c.column_name=r.column_name
    WHERE c.column_name IS NULL
  ) THEN
    RAISE EXCEPTION 'V5 destination columns differ from expected schema. No player prices changed.';
  END IF;

  -- Normalize incoming box-score columns through JSON. This tolerates alternate
  -- provider column names without relying on nonexistent SQL identifiers.
  CREATE TEMP TABLE spats_v5_games ON COMMIT DROP AS
  WITH source AS (
    SELECT pg.player_id::text AS player_id,pg.game_id::text AS game_id,
     pg.season,gm.game_date,
     coalesce(er.rating_before,1500)::numeric AS opponent_elo,
     to_jsonb(pg) AS box
    FROM spats_market.player_games pg
    JOIN spats_market.games gm ON gm.id=pg.game_id
    LEFT JOIN spats_market.elo_history er
      ON er.game_id=pg.game_id
     AND er.formula_version='spats-elo-v3'
     AND er.team_id=CASE
        WHEN pg.team_id::text=gm.home_team_id::text THEN gm.away_team_id
        ELSE gm.home_team_id END
    WHERE pg.season IN (2026,2027)
      AND gm.status='final'
      AND coalesce(nullif(to_jsonb(pg)->>'played','')::boolean,true)
  ), extracted AS (
   SELECT player_id,game_id,season,game_date,opponent_elo,
     coalesce(nullif(box->>'points','')::numeric,0) AS pts,
     coalesce(nullif(box->>'rebounds','')::numeric,0) AS reb,
     coalesce(nullif(box->>'assists','')::numeric,0) AS ast,
     coalesce(nullif(box->>'steals','')::numeric,0) AS stl,
     coalesce(nullif(box->>'blocks','')::numeric,0) AS blk,
     coalesce(nullif(box->>'turnovers','')::numeric,0) AS tov,
     coalesce(nullif(coalesce(box->>'fg_made',box->>'field_goals_made'),'')::numeric,0) AS fgm,
     coalesce(nullif(coalesce(box->>'fg_attempted',box->>'field_goals_attempted'),'')::numeric,0) AS fga,
     coalesce(nullif(coalesce(box->>'ft_made',box->>'free_throws_made'),'')::numeric,0) AS ftm,
     coalesce(nullif(coalesce(box->>'ft_attempted',box->>'free_throws_attempted'),'')::numeric,0) AS fta,
     coalesce(nullif(coalesce(box->>'offensive_rebounds',box->>'rebounds_offensive'),'')::numeric,0) AS oreb,
     coalesce(nullif(coalesce(box->>'defensive_rebounds',box->>'rebounds_defensive'),'')::numeric,0) AS dreb,
     coalesce(nullif(coalesce(box->>'personal_fouls',box->>'fouls'),'')::numeric,0) AS fouls,
     nullif(box->>'true_shooting_pct','')::numeric AS ts
   FROM source
  )
  SELECT DISTINCT ON (player_id,game_id)
   player_id,game_id,season,game_date,opponent_elo,
   pts,reb,ast,stl,blk,tov,
   coalesce(
    CASE WHEN ts IS NULL THEN NULL WHEN ts>1.5 THEN ts/100 ELSE ts END,
    CASE WHEN (fga+0.44*fta)>0 THEN pts/(2*(fga+0.44*fta)) ELSE 0.54 END
   )::numeric AS true_shooting,
   (pts+0.4*fgm-0.7*fga-0.4*(fta-ftm)+0.7*oreb+0.3*dreb+
    stl+0.7*ast+0.7*blk-0.4*fouls-tov)::numeric AS performance
  FROM extracted
  ORDER BY player_id,game_id,game_date;

  CREATE INDEX ON pg_temp.spats_v5_games(player_id,season,game_date);

  CREATE TEMP TABLE spats_v5_prior ON COMMIT DROP AS
  WITH aggregates AS (
   SELECT player_id,count(*)::integer AS games,
    avg(pts) AS ppg,avg(reb) AS rpg,avg(ast) AS apg,
    avg(stl) AS spg,avg(blk) AS bpg,avg(tov) AS topg,
    avg(true_shooting) AS ts,avg(performance) AS expected
   FROM pg_temp.spats_v5_games
   WHERE season=2026 GROUP BY player_id
  ), quality AS (
   SELECT *,
    (0.75*ppg+1.2*rpg+1.5*apg+2*spg+2*bpg-1.5*topg+
     greatest(-3::numeric,least(3::numeric,(ts-0.54)*12)))::numeric AS quality_score
   FROM aggregates
  ), ranked AS (
   SELECT player_id,percent_rank() OVER (ORDER BY quality_score,player_id) AS pct
   FROM quality WHERE games>=3
  )
  SELECT q.player_id,q.games,q.quality_score,q.expected,
   coalesce(r.pct,0.5)::numeric AS pct
  FROM quality q LEFT JOIN ranked r USING (player_id);

  -- No partial publication: these deletes and the full replay share one transaction.
  DELETE FROM spats_market.player_price_history WHERE season=2027 AND formula_version='V5';
  DELETE FROM spats_market.player_ratings WHERE season=2027 AND formula_version='V5';

  FOR player IN
   SELECT ids.player_id,p.games AS prior_games,p.pct,p.quality_score,p.expected
   FROM (
     SELECT player_id::text AS player_id FROM spats_market.player_seasons WHERE season=2027
     UNION
     SELECT player_id FROM pg_temp.spats_v5_games WHERE season=2027
   ) ids
   LEFT JOIN pg_temp.spats_v5_prior p USING (player_id)
   ORDER BY ids.player_id
  LOOP
   -- Opening price bands and 15-game small-sample shrink to $100.
   opening:=CASE
     WHEN player.prior_games IS NULL OR player.prior_games<3 THEN 100
     WHEN player.pct<0.25 THEN 50+25*player.pct/0.25
     WHEN player.pct<0.50 THEN 75+25*(player.pct-0.25)/0.25
     WHEN player.pct<0.75 THEN 100+50*(player.pct-0.50)/0.25
     WHEN player.pct<0.90 THEN 150+50*(player.pct-0.75)/0.15
     ELSE 200+100*(player.pct-0.90)/0.10 END;
   opening:=round(100+(opening-100)*least(1::numeric,coalesce(player.prior_games,0)/15.0),2);
   price:=opening;
   reference_quality:=coalesce(player.expected,8);
   expectation:=reference_quality;
   quality:=reference_quality;
   player_games:=0;

   FOR game IN
    SELECT * FROM pg_temp.spats_v5_games
    WHERE player_id=player.player_id AND season=2027
    ORDER BY game_date,game_id
   LOOP
    price_before:=price;quality_before:=quality;
    opponent_expectation:=greatest(1::numeric,
      expectation-(game.opponent_elo-1500)*0.006);
    signal:=(game.performance-opponent_expectation)*0.012+
      greatest(-0.04::numeric,least(0.04::numeric,
        (quality-reference_quality)*0.003));
    step_pct:=greatest(-0.15::numeric,least(0.15::numeric,signal));
    price:=round(greatest(10::numeric,price_before*(1+step_pct)),2);
    expectation:=0.8*expectation+0.2*game.performance;
    quality:=0.9*quality+0.1*game.performance;
    player_games:=player_games+1;

    INSERT INTO spats_market.player_price_history(
     player_id,season,game_id,formula_version,event_type,
     price_before,price_after,change_pct,quality_before,quality_after,
     event_time,explanation
    ) VALUES(
     player.player_id,2027,game.game_id,'V5','game',price_before,price,
     CASE WHEN price_before>0 THEN round(100*(price/price_before-1),4) ELSE 0 END,
     quality_before,quality,game.game_date,
     format('V5 game score %s against expected %s',round(game.performance,2),round(opponent_expectation,2))
    );
    events_total:=events_total+1;
   END LOOP;

   INSERT INTO spats_market.player_ratings(
    player_id,season,formula_version,opening_price,stock_price,
    opening_quality,current_quality,expected_performance,games_processed,
    missed_streak,updated_at
   ) VALUES(
    player.player_id,2027,'V5',opening,price,reference_quality,quality,
    expectation,player_games,0,now()
   );
   players_total:=players_total+1;
   minimum:=least(coalesce(minimum,price),price);
   maximum:=greatest(coalesce(maximum,price),price);
  END LOOP;

  RETURN jsonb_build_object('success',true,'version','V5','season',2027,
   'playersPriced',players_total,'gamesPriced',events_total,
   'minimumPrice',minimum,'maximumPrice',maximum);
END;
$spats_v5$;

-- Prevent unauthenticated public execution. Vercel uses service_role.
REVOKE ALL ON FUNCTION public.calculate_player_v5() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_player_v5() TO service_role;

-- FIRST RUN, after reviewing the prerequisite table columns above:
-- SELECT public.calculate_player_v5();
--
-- VERIFICATION:
-- SELECT COUNT(*) AS published_players,MIN(stock_price),MAX(stock_price)
-- FROM spats_market.player_ratings WHERE season=2027 AND formula_version='V5';
-- SELECT COUNT(*) AS game_price_events
-- FROM spats_market.player_price_history WHERE season=2027 AND formula_version='V5';
