# SPATS Preseason Model Lab
Next.js app for Sports Analytics at WMU. Club members build individual ranking models and vote in shared sessions.

## Data
Loads actual SPATS 2027 preseason experiment CSV from the SPATS-CBB-MODEL GitHub repository. It includes 334 teams with complete experimental inputs, not every D-I team. Talent = prior-season top-five/top-eight SPATS player ratings; performance = 2025–26 raw win percentage. Continuity is currently a **neutral constant of 50 for all teams**, not a measured input. It does not affect the ordering, and the 75/15/10 formula is unvalidated. This is a workshop prototype, not a forecast.

## Deploy
1. In Supabase, create a project and run `supabase/schema.sql` in SQL Editor.
2. In Vercel, import this GitHub repository as a Next.js project.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to your Supabase project URL and public/anon key.
4. Deploy and test with two devices.
5. Club members use Model Builder to set weights, then Club Session to create/join a code, submit models and vote.

## Security
The database uses permissive anonymous write policies and browser session identifiers. This is not secure against impersonation, vote manipulation or spam. Use only in a trusted classroom demo. Implement Supabase Auth, ownership-based RLS and vote restrictions before making voting broadly public.

## Local development
`npm install` then `npm run dev`. Without Supabase variables, the model builder and research sections work but club sessions do not.

Deployment trigger: initial Vercel production build requested.

Vercel redeployment trigger after reconnecting GitHub integration.
