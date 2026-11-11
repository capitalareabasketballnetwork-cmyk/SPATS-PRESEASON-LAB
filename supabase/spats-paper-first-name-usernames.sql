-- SPATS: Display account first names as leaderboard usernames.
-- Run in Supabase SQL Editor once, after spats-paper-cloud-leaderboard.sql.
-- Only default trader_<id> usernames are migrated; customized names stay untouched.
-- Duplicates get an ID suffix (e.g. Alex, Alex_a1b2c3).
-- Updates the auth trigger so future accounts follow the same naming rule.

CREATE OR REPLACE FUNCTION public.spats_paper_register_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  first_clean text;
  candidate text;
  suffix text;
  attempt integer := 0;
BEGIN
  first_clean := regexp_replace(
    coalesce(
      nullif(trim(NEW.raw_user_meta_data->>'first_name'),''),
      nullif(split_part(trim(NEW.raw_user_meta_data->>'full_name'),' ',1),''),
      'Trader'
    ),
    '[^A-Za-z0-9_]', '', 'g'
  );

  IF first_clean = '' OR first_clean !~ '^[A-Za-z]' THEN
    first_clean := 'Trader';
  END IF;
  first_clean := left(first_clean,24);
  suffix := substr(replace(NEW.id::text,'-',''),1,6);
  candidate := CASE WHEN length(first_clean)<3
    THEN left(first_clean,17)||'_'||suffix ELSE first_clean END;

  WHILE EXISTS (
    SELECT 1 FROM public.spats_paper_users
    WHERE lower(username)=lower(candidate) AND user_id<>NEW.id
  ) LOOP
    attempt := attempt+1;
    candidate := left(first_clean,17)||'_'||substr(replace(NEW.id::text,'-',''),1,least(6+attempt,6));
    IF attempt>1 THEN
      candidate := left(first_clean,14)||'_'||substr(replace(NEW.id::text,'-',''),1,8)||'_'||attempt::text;
    END IF;
    IF attempt>=20 THEN RAISE EXCEPTION 'Could not allocate unique trader username'; END IF;
  END LOOP;

  INSERT INTO public.spats_paper_users(user_id,username)
  VALUES(NEW.id,candidate)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  rec record;
  first_clean text;
  candidate text;
  suffix text;
  attempt integer;
BEGIN
  FOR rec IN
    SELECT p.user_id, u.raw_user_meta_data
    FROM public.spats_paper_users p
    JOIN auth.users u ON u.id=p.user_id
    WHERE p.username = 'trader_'||substr(replace(p.user_id::text,'-',''),1,12)
    ORDER BY p.user_id
  LOOP
    first_clean := regexp_replace(
      coalesce(
        nullif(trim(rec.raw_user_meta_data->>'first_name'),''),
        nullif(split_part(trim(rec.raw_user_meta_data->>'full_name'),' ',1),''),
        'Trader'
      ),
      '[^A-Za-z0-9_]', '', 'g'
    );
    IF first_clean = '' OR first_clean !~ '^[A-Za-z]' THEN
      first_clean := 'Trader';
    END IF;
    first_clean := left(first_clean,24);
    suffix := substr(replace(rec.user_id::text,'-',''),1,6);
    candidate := CASE WHEN length(first_clean)<3
      THEN left(first_clean,17)||'_'||suffix ELSE first_clean END;
    attempt := 0;

    WHILE EXISTS(
      SELECT 1 FROM public.spats_paper_users
      WHERE lower(username)=lower(candidate) AND user_id<>rec.user_id
    ) LOOP
      attempt := attempt+1;
      candidate := left(first_clean,17)||'_'||suffix;
      IF attempt>1 THEN
        candidate := left(first_clean,14)||'_'||substr(replace(rec.user_id::text,'-',''),1,8)||'_'||attempt::text;
      END IF;
      IF attempt>=20 THEN RAISE EXCEPTION 'Could not allocate unique trader username';END IF;
    END LOOP;

    UPDATE public.spats_paper_users
    SET username=candidate, updated_at=now()
    WHERE user_id=rec.user_id;
  END LOOP;
END;
$$;

-- Inspect the public handles; no emails are exposed.
SELECT username, cash
FROM public.spats_paper_users
ORDER BY username;
