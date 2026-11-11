-- SPATS PAPER EXCHANGE V1: cloud account, atomic simulated trades and
-- server-valued leaderboard. NO real money, payments, deposits, or withdrawals.
-- Apply ONCE in Supabase SQL Editor (same project as SPATS auth and spats_market).
--
-- Existing browser-local paper accounts are NOT imported: untrusted localStorage
-- balances cannot safely become authoritative ranked balances.
-- Every authenticated SPATS account begins with exactly $10,000 virtual cash.

create table if not exists public.spats_paper_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[A-Za-z0-9_]{3,24}$'),
 cash numeric(20,2) not null default 10000.00 check(cash >= 0),
 realized_pnl numeric(20,2) not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.spats_paper_holdings (
 user_id uuid not null references public.spats_paper_users(user_id) on delete cascade,
 asset_type text not null check(asset_type in ('team','player')),
 asset_id text not null check(length(asset_id) between 1 and 100),
 quantity numeric(20,4) not null check(quantity>0),
 cost_basis numeric(20,2) not null check(cost_basis>=0),
 primary key(user_id,asset_type,asset_id)
);
create table if not exists public.spats_paper_trades (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.spats_paper_users(user_id) on delete cascade,
 asset_type text not null check(asset_type in ('team','player')),
 asset_id text not null,
 side text not null check(side in ('buy','sell')),
 quantity numeric(20,4) not null check(quantity>0),
 execution_price numeric(20,2) not null check(execution_price>0),
 total numeric(20,2) not null check(total>0),
 realized_pnl numeric(20,2) not null default 0,
 created_at timestamptz not null default now()
);
create index if not exists spats_paper_trades_user_time on public.spats_paper_trades(user_id,created_at desc);
create index if not exists spats_paper_holdings_asset on public.spats_paper_holdings(asset_type,asset_id);

alter table public.spats_paper_users enable row level security;
alter table public.spats_paper_holdings enable row level security;
alter table public.spats_paper_trades enable row level security;
-- No direct client writes: all movements must pass the server-priced RPCs.
revoke all on public.spats_paper_users,public.spats_paper_holdings,public.spats_paper_trades from anon,authenticated;
grant select on public.spats_paper_users,public.spats_paper_holdings,public.spats_paper_trades to service_role;

-- Automatically creates a non-identifying username; users can choose their own.
create or replace function public.spats_paper_register_user()
returns trigger language plpgsql security definer
set search_path = pg_catalog,public as $$
begin
 insert into public.spats_paper_users(user_id,username)
 values (new.id,'trader_'||substr(replace(new.id::text,'-',''),1,12))
 on conflict (user_id) do nothing;
 return new;
end;$$;
drop trigger if exists spats_paper_signup on auth.users;
create trigger spats_paper_signup after insert on auth.users for each row
execute function public.spats_paper_register_user();
insert into public.spats_paper_users(user_id,username)
select id,'trader_'||substr(replace(id::text,'-',''),1,12)
from auth.users
on conflict(user_id) do nothing;

-- Latest publicly published simulated market valuation. Never use player previews.
create or replace function public.spats_paper_market_price(p_type text,p_id text)
returns numeric language plpgsql stable security definer
set search_path=pg_catalog,public,spats_market as $$
declare v_price numeric;
begin
 if p_type='team' then
  select stock_price into v_price from spats_market.current_ratings
  where team_id::text=p_id;
 elsif p_type='player' then
  select stock_price into v_price from spats_market.player_ratings
  where player_id::text=p_id and season=2027 and formula_version='V5';
 else return null;
 end if;
 return case when v_price>0 then round(v_price,2) else null end;
end;$$;
revoke all on function public.spats_paper_market_price(text,text) from public,anon,authenticated;

create or replace function public.spats_paper_set_username(p_username text)
returns text language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_user uuid:=auth.uid(); v_username text:=trim(p_username);
begin
 if v_user is null then raise exception 'Sign in required';end if;
 if v_username !~ '^[A-Za-z][A-Za-z0-9_]{2,23}$' then
  raise exception 'Username must be 3–24 letters, numbers, or underscores and begin with a letter';
 end if;
 update public.spats_paper_users set username=v_username,updated_at=now()
 where user_id=v_user;
 if not found then raise exception 'Paper trading account not initialized';end if;
 return v_username;
end;$$;
revoke all on function public.spats_paper_set_username(text) from public,anon;
grant execute on function public.spats_paper_set_username(text) to authenticated;

create or replace function public.spats_paper_trade(
 p_asset_type text,p_asset_id text,p_side text,p_quantity numeric
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,spats_market as $$
declare
 v_user uuid:=auth.uid();
 v_wallet public.spats_paper_users%rowtype;
 v_holding public.spats_paper_holdings%rowtype;
 v_price numeric;v_amount numeric;v_cost numeric:=0;v_pnl numeric:=0;
 v_left numeric;
begin
 if v_user is null then raise exception 'Sign in required';end if;
 if p_asset_type not in ('team','player') or p_asset_id is null or length(p_asset_id) not between 1 and 100
 or p_side not in ('buy','sell') then raise exception 'Invalid order';end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>100000 or p_quantity<>round(p_quantity,4) then
  raise exception 'Quantity must be positive and have at most four decimal places';end if;
 select * into v_wallet from public.spats_paper_users where user_id=v_user for update;
 if not found then raise exception 'Paper trading account not initialized';end if;
 v_price:=public.spats_paper_market_price(p_asset_type,p_asset_id);
 if v_price is null then raise exception 'Published model price unavailable for this asset';end if;
 v_amount:=round(p_quantity*v_price,2);
 if v_amount<0.01 then raise exception 'Order below one cent';end if;

 select * into v_holding from public.spats_paper_holdings
 where user_id=v_user and asset_type=p_asset_type and asset_id=p_asset_id for update;
 if p_side='buy' then
  if v_amount>v_wallet.cash then raise exception 'Insufficient simulated cash: available %',v_wallet.cash;end if;
  insert into public.spats_paper_holdings(user_id,asset_type,asset_id,quantity,cost_basis)
  values(v_user,p_asset_type,p_asset_id,p_quantity,v_amount)
  on conflict (user_id,asset_type,asset_id) do update set
   quantity=public.spats_paper_holdings.quantity+excluded.quantity,
   cost_basis=public.spats_paper_holdings.cost_basis+excluded.cost_basis;
  update public.spats_paper_users set cash=cash-v_amount,updated_at=now() where user_id=v_user;
 else
  if v_holding.user_id is null or v_holding.quantity<p_quantity then raise exception 'Insufficient shares to sell';end if;
  v_cost:=case when p_quantity=v_holding.quantity then v_holding.cost_basis
    else round(v_holding.cost_basis*p_quantity/v_holding.quantity,2) end;
  v_pnl:=v_amount-v_cost;
  v_left:=v_holding.quantity-p_quantity;
  if v_left=0 then
   delete from public.spats_paper_holdings where user_id=v_user and asset_type=p_asset_type and asset_id=p_asset_id;
  else
   update public.spats_paper_holdings
    set quantity=v_left,cost_basis=v_holding.cost_basis-v_cost
    where user_id=v_user and asset_type=p_asset_type and asset_id=p_asset_id;
  end if;
  update public.spats_paper_users set cash=cash+v_amount,realized_pnl=realized_pnl+v_pnl,
   updated_at=now() where user_id=v_user;
 end if;
 insert into public.spats_paper_trades(user_id,asset_type,asset_id,side,quantity,execution_price,total,realized_pnl)
 values(v_user,p_asset_type,p_asset_id,p_side,p_quantity,v_price,v_amount,v_pnl);
 return jsonb_build_object('success',true,'side',p_side,'assetType',p_asset_type,
  'assetId',p_asset_id,'quantity',p_quantity,'price',v_price,'total',v_amount,
  'cash',case when p_side='buy' then v_wallet.cash-v_amount else v_wallet.cash+v_amount end);
end;$$;
revoke all on function public.spats_paper_trade(text,text,text,numeric) from public,anon;
grant execute on function public.spats_paper_trade(text,text,text,numeric) to authenticated;

create or replace function public.spats_paper_my_account()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,spats_market as $$
declare v_user uuid:=auth.uid();v_wallet record;v_holdings jsonb;v_trades jsonb;
begin
 if v_user is null then raise exception 'Sign in required';end if;
 select username,cash,realized_pnl into v_wallet from public.spats_paper_users where user_id=v_user;
 if not found then raise exception 'Paper trading account not initialized';end if;
 select coalesce(jsonb_agg(jsonb_build_object('asset',h.asset_type,'id',h.asset_id,'key',h.asset_type||':'||h.asset_id,
  'name',case when h.asset_type='team' then coalesce((select t.name from spats_market.teams t where t.id::text=h.asset_id),'Team')
    else coalesce((select p.full_name from spats_market.players p where p.id::text=h.asset_id),'Player') end,
  'quantity',h.quantity,'costBasis',h.cost_basis)),'[]'::jsonb)
 into v_holdings from public.spats_paper_holdings h where h.user_id=v_user;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'at',t.created_at,'side',t.side,
  'key',t.asset_type||':'||t.asset_id,
  'name',case when t.asset_type='team' then coalesce((select x.name from spats_market.teams x where x.id::text=t.asset_id),'Team')
    else coalesce((select p.full_name from spats_market.players p where p.id::text=t.asset_id),'Player') end,
  'quantity',t.quantity,'price',t.execution_price,'total',t.total,'realizedPnl',t.realized_pnl)
  order by t.created_at desc),'[]'::jsonb)
 into v_trades from (select * from public.spats_paper_trades where user_id=v_user order by created_at desc limit 100)t;
 return jsonb_build_object('username',v_wallet.username,'cash',v_wallet.cash,'realizedPnl',v_wallet.realized_pnl,
  'positions',v_holdings,'trades',v_trades);
end;$$;
revoke all on function public.spats_paper_my_account() from public,anon;
grant execute on function public.spats_paper_my_account() to authenticated;

create or replace function public.spats_paper_leaderboard()
returns table(user_id uuid,username text,portfolio_value numeric,cash numeric,holdings_value numeric,
  total_profit_loss numeric,holdings_count bigint)
language sql stable security definer
set search_path=pg_catalog,public,spats_market as $$
 select u.user_id,u.username,
  round(u.cash+coalesce(sum(h.quantity*coalesce(public.spats_paper_market_price(h.asset_type,h.asset_id),
      case when h.quantity>0 then h.cost_basis/h.quantity else 0 end)),0),2) as portfolio_value,
  u.cash,
  round(coalesce(sum(h.quantity*coalesce(public.spats_paper_market_price(h.asset_type,h.asset_id),
      case when h.quantity>0 then h.cost_basis/h.quantity else 0 end)),0),2) as holdings_value,
  round(u.cash+coalesce(sum(h.quantity*coalesce(public.spats_paper_market_price(h.asset_type,h.asset_id),
      case when h.quantity>0 then h.cost_basis/h.quantity else 0 end)),0)-10000,2) as total_profit_loss,
  count(h.asset_id) as holdings_count
 from public.spats_paper_users u
 left join public.spats_paper_holdings h on h.user_id=u.user_id
 group by u.user_id,u.username,u.cash
 order by portfolio_value desc,username asc;
$$;
revoke all on function public.spats_paper_leaderboard() from public,anon;
grant execute on function public.spats_paper_leaderboard() to authenticated;

-- Verify setup:
-- select count(*) as registered_traders from public.spats_paper_users;
-- Log into the website and open /stocks to see your cloud wallet.
-- No user can edit cash/holdings directly; transactions must go through RPC.
