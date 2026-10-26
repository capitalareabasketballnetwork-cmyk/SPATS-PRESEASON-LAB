# NFL Club Competition — implementation plan and integration contract

Status: club membership and model submission implemented in code; **migration not applied, automated prediction/scoring not implemented, not production deployed**.

## Confirmed rules
- NFL only; NBA remains out of scope.
- One active submitted model per member per club.
- Members select existing saved NFL Model Lab models; do not re-enter weights.
- Predictions are hidden from other members until each game's kickoff.
- Main season ranking is correct picks / graded picks. Ties and voids excluded from denominator.
- Never score retroactive backtests as live competition picks.

## Remaining required integrations
1. NFL Model Lab saved models confirmed in `football_saved_models` and exposed in `/football`. Club UI reads these saved models; secure Supabase RPCs create/join clubs and submit snapshots.
2. Apply `supabase/nfl-club.sql` to Supabase and verify authenticated create/join/submit flows, including permission boundaries. Existing site already provides Supabase Auth.
3. Extend the `/club` page with real leaderboards, weekly picks, member profiles, and settings. Existing page includes club management and saved-model submission.
4. Implement scheduled prediction jobs using the existing NFL engine and pregame-only feature snapshots. Persist source version and input cutoff. Never use future information.
5. Store each game with authoritative kickoff time; lock picks before kickoff, never overwrite a locked pick, and expose opponent picks only once kickoff has passed.
6. Implement final-score ingestion, idempotent grading, and clear error/retry logs. Rank by accuracy with a minimum graded-game threshold and show graded-game counts.
7. Test Supabase row-level security, concurrent submissions, schedule changes, postponed/tied games, and deployment.

## Database
Run `supabase/nfl-club.sql` after Supabase Auth is configured. The SQL intentionally grants no client-side write policies; write actions must be implemented server-side and authorized before launch.

Do not deploy this database migration to production until the app integration and auth flow are complete.
