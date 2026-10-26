# NFL Club Competition — implementation plan and integration contract

Status: database foundation only; **not yet operational or deployed**.

## Confirmed rules
- NFL only; NBA remains out of scope.
- One active submitted model per member per club.
- Members select existing saved NFL Model Lab models; do not re-enter weights.
- Predictions are hidden from other members until each game's kickoff.
- Main season ranking is correct picks / graded picks. Ties and voids excluded from denominator.
- Never score retroactive backtests as live competition picks.

## Remaining required integrations
1. Locate the production NFL Model Lab's actual saved-model storage and prediction API. The present repository's existing builder is a *college basketball* ranking builder, not the NFL Model Lab. Do not pretend its saved models are NFL models.
2. Implement Supabase Auth, authenticated club creation, invitation-code joining, member profiles, and server-side model submission. Use a single transaction to retire the previous active model and create the next version.
3. Build the /club page with Overview, Leaderboard, Weekly Picks, My Model, Members, and Club Settings.
4. Implement scheduled prediction jobs using the existing NFL engine and pregame-only feature snapshots. Persist source version and input cutoff. Never use future information.
5. Store each game with authoritative kickoff time; lock picks before kickoff, never overwrite a locked pick, and expose opponent picks only once kickoff has passed.
6. Implement final-score ingestion, idempotent grading, and clear error/retry logs. Rank by accuracy with a minimum graded-game threshold and show graded-game counts.
7. Test Supabase row-level security, concurrent submissions, schedule changes, postponed/tied games, and deployment.

## Database
Run `supabase/nfl-club.sql` after Supabase Auth is configured. The SQL intentionally grants no client-side write policies; write actions must be implemented server-side and authorized before launch.

Do not deploy this database migration to production until the app integration and auth flow are complete.
