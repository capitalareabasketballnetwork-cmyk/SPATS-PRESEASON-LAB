-- Run in Supabase SQL editor before deploying the club admin gate.
-- Only database administrators/service-role can add rows to this allowlist.
create table if not exists public.nfl_club_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_at timestamptz not null default now()
);
alter table public.nfl_club_admins enable row level security;
revoke all on public.nfl_club_admins from anon,authenticated;
create or replace function public.nfl_is_club_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.nfl_club_admins where user_id=auth.uid()) $$;
revoke all on function public.nfl_is_club_admin() from public,anon;
grant execute on function public.nfl_is_club_admin() to authenticated;
-- Replace the existing SECURITY DEFINER RPC: hiding the create button is not authorization.
create or replace function public.nfl_create_club(p_name text,p_display_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_code text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if not public.nfl_is_club_admin() then raise exception 'Only club administrators can create clubs'; end if;
 if length(trim(p_name)) not between 2 and 80 or length(trim(p_display_name)) not between 1 and 40 then raise exception 'Invalid name'; end if;
 loop
  v_code:=upper(substr(encode(gen_random_bytes(8),'hex'),1,8));
  begin
   insert into public.nfl_clubs(name,invite_code,owner_id) values(trim(p_name),v_code,auth.uid()) returning id into v_id;
   exit;
  exception when unique_violation then continue;
  end;
 end loop;
 insert into public.nfl_club_members(club_id,user_id,display_name) values(v_id,auth.uid(),trim(p_display_name));
 return v_id;
end $$;
revoke all on function public.nfl_create_club(text,text) from public,anon;
grant execute on function public.nfl_create_club(text,text) to authenticated;
-- Membership lasts until a member explicitly leaves.
create or replace function public.nfl_leave_club(p_club_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if exists(select 1 from public.nfl_clubs where id=p_club_id and owner_id=auth.uid()) then
  raise exception 'Club owners cannot leave their club. Transfer or delete the club first.';
 end if;
 -- Preserve historical competition records; retire model and revoke membership.
 update public.nfl_club_models set retired_at=now()
 where club_id=p_club_id and user_id=auth.uid() and retired_at is null;
 delete from public.nfl_club_members where club_id=p_club_id and user_id=auth.uid();
end $$;
revoke all on function public.nfl_leave_club(uuid) from public,anon;
grant execute on function public.nfl_leave_club(uuid) to authenticated;
-- Initial setup: replace the email with your exact Supabase Auth email and run once.
-- insert into public.nfl_club_admins(user_id)
-- select id from auth.users where email='YOUR_ADMIN_EMAIL_HERE'
-- on conflict (user_id) do nothing;
