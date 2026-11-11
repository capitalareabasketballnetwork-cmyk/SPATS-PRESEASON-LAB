-- SPATS PAPER TRADER PROFILES + HISTORICAL PORTFOLIO SNAPSHOTS
-- Run in Supabase SQL Editor after spats-paper-cloud-leaderboard.sql.
-- Uses only virtual-money portfolios. No banking data, emails, or private trades exposed.
-- Captures the CURRENT portfolio at installation, on every trade, and on daily market refresh.
-- Earlier historical valuations are unknown and intentionally NOT invented.
create table if not exists public.spats_paper_portfolio_history(
 id bigint generated always as identity primary key,
 user_id uuid not null references public.spats_paper_users(user_id) on delete cascade,
 observed_at timestamptz not null default now(),
 cash numeric(20,2) not null,
 holdings_value numeric(20,2) not null,
 portfolio_value numeric(20,2) not null,
 source text not null check(source in ('initial_snapshot','trade','daily'))
);
create index if not exists spats_paper_history_owner_date
 on public.spats_paper_portfolio_history(user_id,observed_at,id);
alter table public.spats_paper_portfolio_history enable row level security;
revoke all on public.spats_paper_portfolio_history from public,anon,authenticated;
grant select,insert on public.spats_paper_portfolio_history to service_role;

-- Internal valuation function with the same published-price rules as the leaderboard.
create or replace function public.spats_paper_capture_snapshot(p_user uuid,p_source text)
returns void language plpgsql security definer
set search_path=pg_catalog,public,spats_market
as $$
declare v_cash numeric;v_holdings numeric;
begin
 if p_source not in ('initial_snapshot','trade','daily') then
  raise exception 'Invalid snapshot type';
 end if;
 select cash into v_cash from public.spats_paper_users where user_id=p_user;
 if not found then return;end if;
 select coalesce(sum(h.quantity*coalesce(
  public.spats_paper_market_price(h.asset_type,h.asset_id),
  case when h.quantity>0 then h.cost_basis/h.quantity else 0 end)),0)
 into v_holdings
 from public.spats_paper_holdings h where h.user_id=p_user;
 insert into public.spats_paper_portfolio_history(
  user_id,cash,holdings_value,portfolio_value,source
 ) values(p_user,v_cash,round(v_holdings,2),round(v_cash+v_holdings,2),p_source);
end;
$$;
revoke all on function public.spats_paper_capture_snapshot(uuid,text) from public,anon,authenticated;
-- This function is called by privileged triggers/functions, never directly by users.

create or replace function public.spats_paper_after_trade_snapshot()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
 perform public.spats_paper_capture_snapshot(new.user_id,'trade');
 return new;
end;$$;
drop trigger if exists spats_paper_trade_snapshot on public.spats_paper_trades;
create trigger spats_paper_trade_snapshot after insert on public.spats_paper_trades
for each row execute function public.spats_paper_after_trade_snapshot();
revoke all on function public.spats_paper_after_trade_snapshot() from public,anon,authenticated;

-- Snapshot all traders when daily model prices have been refreshed.
create or replace function public.spats_paper_snapshot_daily()
returns integer language plpgsql security definer
set search_path=pg_catalog,public as $$
declare r record; total integer:=0;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'Unauthorized';
 end if;
 for r in select user_id from public.spats_paper_users loop
  perform public.spats_paper_capture_snapshot(r.user_id,'daily');
  total:=total+1;
 end loop;
 return total;
end;$$;
revoke all on function public.spats_paper_snapshot_daily() from public,anon,authenticated;
grant execute on function public.spats_paper_snapshot_daily() to service_role;

-- Current holdings and historical equity snapshots for a selected trader.
-- Explicitly limits output to public portfolio metrics; no email or trade identifiers.
create or replace function public.spats_paper_trader_details(p_user_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,spats_market
as $$
declare v_username text;v_cash numeric;v_realized numeric;
 v_holdings jsonb;v_history jsonb;v_holdings_value numeric;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select username,cash,realized_pnl into v_username,v_cash,v_realized
 from public.spats_paper_users where user_id=p_user_id;
 if not found then raise exception 'Trader not found';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'asset',h.asset_type,'id',h.asset_id,
  'name',case when h.asset_type='team' then coalesce(
   (select t.name from spats_market.teams t where t.id::text=h.asset_id),'Team')
   else coalesce((select p.full_name from spats_market.players p where p.id::text=h.asset_id),'Player') end,
  'quantity',h.quantity,'avgCost',case when h.quantity>0 then round(h.cost_basis/h.quantity,2) else 0 end,
  'costBasis',h.cost_basis,'currentPrice',coalesce(
   public.spats_paper_market_price(h.asset_type,h.asset_id),
   case when h.quantity>0 then round(h.cost_basis/h.quantity,2) else 0 end),
  'marketValue',round(h.quantity*coalesce(public.spats_paper_market_price(h.asset_type,h.asset_id),
   case when h.quantity>0 then h.cost_basis/h.quantity else 0 end),2),
  'unrealizedPnl',round(h.quantity*coalesce(public.spats_paper_market_price(h.asset_type,h.asset_id),
   case when h.quantity>0 then h.cost_basis/h.quantity else 0 end)-h.cost_basis,2)
 ) order by h.asset_type,h.asset_id),'[]'::jsonb),
 coalesce(sum(h.quantity*coalesce(public.spats_paper_market_price(h.asset_type,h.asset_id),
  case when h.quantity>0 then h.cost_basis/h.quantity else 0 end)),0)
 into v_holdings,v_holdings_value
 from public.spats_paper_holdings h where h.user_id=p_user_id;
 select coalesce(jsonb_agg(jsonb_build_object(
  'at',s.observed_at,'value',s.portfolio_value,'cash',s.cash,
  'holdingsValue',s.holdings_value,'source',s.source) order by s.observed_at,s.id),'[]'::jsonb)
 into v_history
 from (select id,observed_at,portfolio_value,cash,holdings_value,source
  from public.spats_paper_portfolio_history
  where user_id=p_user_id order by observed_at desc,id desc limit 500)s;
 -- History is returned in ascending order by the aggregate ordering above.
 return jsonb_build_object('username',v_username,'cash',v_cash,
  'portfolioValue',round(v_cash+v_holdings_value,2),
  'holdingsValue',round(v_holdings_value,2),'realizedPnl',v_realized,
  'positions',v_holdings,'history',v_history);
end;$$;
revoke all on function public.spats_paper_trader_details(uuid) from public,anon;
grant execute on function public.spats_paper_trader_details(uuid) to authenticated;

-- Establish an accurate baseline at deployment time; don't backdate snapshots.
insert into public.spats_paper_portfolio_history(user_id,cash,holdings_value,portfolio_value,source)
select p.user_id,p.cash,
 round(coalesce(sum(h.quantity*coalesce(public.spats_paper_market_price(h.asset_type,h.asset_id),
  case when h.quantity>0 then h.cost_basis/h.quantity else 0 end)),0),2),
 round(p.cash+coalesce(sum(h.quantity*coalesce(public.spats_paper_market_price(h.asset_type,h.asset_id),
  case when h.quantity>0 then h.cost_basis/h.quantity else 0 end)),0),2),
 'initial_snapshot'
from public.spats_paper_users p
left join public.spats_paper_holdings h on h.user_id=p.user_id
where not exists (select 1 from public.spats_paper_portfolio_history ph where ph.user_id=p.user_id)
group by p.user_id,p.cash;

select count(*) as snapshot_rows from public.spats_paper_portfolio_history;
