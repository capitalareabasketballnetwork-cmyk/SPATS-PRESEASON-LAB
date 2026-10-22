# SPATS multi-sport data and model notes

## Current implementation
Routes: /college-football, /college-basketball, /nba.
The shared engine in lib/multisport-model.ts uses only completed games *prior to the game being predicted*. It skips teams with fewer than three earlier games and does not use final scores to construct that game's features. The initial eight metrics (wins, margin, points for/against, last-five results, home/road records) are calculated from scoreboard results. These are not advanced efficiency metrics. Game data is fetched from ESPN public scoreboards by season via /api/multisport. ESPN is an unofficial source with no guaranteed API stability; the endpoint reports failures and never fabricates games. Partial coverage may bias backtests. Historical accuracy is descriptive, not a future guarantee. Current saved models are browser-local, not Supabase account records.

## Researched upgrade sources
- College football: https://api.collegefootballdata.com/data-availability — documented games and schedules back to 1869, team box scores from 2004, advanced game/team data from 2001, lines from 2013, returning production from 2014. API key required; verify subscription and quotas. For more detailed play data: https://cfbfastr.sportsdataverse.org/
- College basketball: https://hoopr.sportsdataverse.org/ and https://github.com/sportsdataverse/hoopR-mbb-data — ESPN-derived box scores and play-by-play; inspect season and team coverage before claiming full D-I coverage. Existing SPATS-CBB-MODEL player ratings and transfers should be integrated as a distinct preseason model, not conflated with in-season box-score ratings.
- NBA: https://hoopr.sportsdataverse.org/ and https://github.com/sportsdataverse/hoopR-nba-data — season box scores, play-by-play and NBA Stats wrappers. Do not assume all data endpoints allow unrestricted production use.
- Refresh and pipeline documentation: https://github.com/sportsdataverse/sportsdataverse-data

## Next production milestones
1. Create versioned ETL snapshots of game, team and player stats in the SPATS repositories, with source URLs, fetched timestamps, season coverage checks, and stable team IDs. Add scheduled ingestion and coverage alerts. Do not use API data scraped from private/paywalled sources without permission.
2. Add advanced, league-specific features: college football EPA/play, success rate, explosiveness, turnovers, SOS; college basketball offensive/defensive efficiency, effective FG%, turnovers, rebounding, free throw rate, tempo, roster continuity; NBA pace, offensive/defensive rating, eFG%, turnovers, rebounding, rest, back-to-backs and injury availability (only when timestamped historical injury data is licensed).
3. Build rolling pregame snapshots, season-to-season cold-start priors, opponent adjustment, and chronological backtesting with calibration/holdout periods. Do not normalize from future games.
4. Persist model weights and versioned results in Supabase per user and league. Keep NFL saved-model records intact.
5. Add historical odds only where verified with line timestamp, market, source, and closing/opening designation. Never present inferred lines as historical sportsbook quotes.

## Caveat
These initial pages are working starter labs, not full replacements for a production-quality NCAA/NBA dataset or betting-grade model. In particular, coverage and scoreboards must be audited before making accuracy comparisons between leagues.
