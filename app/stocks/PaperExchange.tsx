'use client';
import {useEffect,useMemo,useState} from 'react';
import {db} from '../../lib/supabase';

export type PaperAsset={asset:'team'|'player';id:string;name:string;price:number|null;priceStatus?:'published'|'preview'};
export type PaperPosition={key:string;asset:'team'|'player';id:string;name:string;quantity:number;costBasis:number};
export type PaperTrade={id:string;at:string;side:'buy'|'sell';key:string;name:string;quantity:number;price:number;total:number;realizedPnl:number};
export type PaperAccount={cash:number;positions:PaperPosition[];trades:PaperTrade[];realizedPnl:number};
const START=10000;
const STORAGE_KEY='spats-paper-exchange-v1';
const initial=():PaperAccount=>({cash:START,positions:[],trades:[],realizedPnl:0});
const round=(x:number)=>Math.round((x+Number.EPSILON)*100)/100;
const qtyRound=(x:number)=>Math.round((x+Number.EPSILON)*10000)/10000;
export const usd=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
export const assetKey=(a:{asset:string;id:string})=>a.asset+':'+a.id;

function readAccount():PaperAccount{
 try{
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw)return initial();
  const val=JSON.parse(raw) as PaperAccount;
  if(!Number.isFinite(val.cash)||val.cash<0||!Array.isArray(val.positions)||!Array.isArray(val.trades)||!Number.isFinite(val.realizedPnl))return initial();
  if(val.positions.some(p=>!Number.isFinite(p.quantity)||p.quantity<=0||!Number.isFinite(p.costBasis)||p.costBasis<0))return initial();
  return val;
 }catch{return initial()}
}

export function usePaperExchange(){
 const [account,setAccount]=useState<PaperAccount>(initial);
 const [hydrated,setHydrated]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [cloud,setCloud]=useState(false);
 const [username,setUsername]=useState('');
 const [cloudNotice,setCloudNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [cloudRevision,setCloudRevision]=useState(0);
 useEffect(()=>{
  let alive=true;
  const load=async()=>{
   if(!db){if(alive){setAccount(readAccount());setHydrated(true);setCloudNotice('Local demo wallet. Shared leaderboard requires Supabase.')}return}
   try{
    const {data:{user}}=await db.auth.getUser();
    if(!user)throw new Error('Sign in to enable cloud trading.');
    const {data,error}=await db.rpc('spats_paper_my_account');
    if(error)throw error;
    if(alive&&data){
     const wallet=data as {cash:number;realizedPnl:number;positions:PaperPosition[];trades:PaperTrade[];username:string};
     setAccount({cash:Number(wallet.cash),realizedPnl:Number(wallet.realizedPnl),positions:(wallet.positions||[]).map(p=>({...p,quantity:Number(p.quantity),costBasis:Number(p.costBasis)})),
      trades:(wallet.trades||[]).map(t=>({...t,quantity:Number(t.quantity),price:Number(t.price),total:Number(t.total),realizedPnl:Number(t.realizedPnl)}))});
     setUsername(wallet.username||'');setCloud(true);setCloudNotice('');
    }
   }catch(e){
    if(alive){setAccount(readAccount());setCloud(false);
     setCloudNotice('Leaderboard setup is not active yet. Trading is local to this browser until the cloud migration is installed.');}
   }finally{if(alive)setHydrated(true)}
  };
  void load();
  return()=>{alive=false};
 },[cloudRevision]);
 useEffect(()=>{
  if(hydrated&&!cloud){
   try{localStorage.setItem(STORAGE_KEY,JSON.stringify(account))}
   catch{setFeedback('Browser storage is unavailable. Trades may not persist.')}
  }
 },[account,hydrated,cloud]);
 const trade=async(stock:PaperAsset,side:'buy'|'sell',quantity:number):Promise<string|null>=>{
  if(!hydrated||busy)return 'Trading account is loading or processing an order.';
  if(stock.priceStatus==='preview')return 'Trading preview player prices is disabled until V5 is published.';
  if(stock.price===null||!Number.isFinite(stock.price)||stock.price<=0)return 'No verified price is available for this stock.';
  if(!Number.isFinite(quantity)||quantity<=0||quantity>100000||qtyRound(quantity)!==quantity)return 'Enter a positive quantity with at most four decimal places.';
  const amount=round(stock.price*quantity);
  if(amount<0.01)return 'Minimum order value is $0.01.';
  const key=assetKey(stock);
  const holding=account.positions.find(p=>p.key===key);
  if(side==='buy'&&amount>account.cash+0.00001)return 'Not enough simulated cash.';
  if(side==='sell'&&(!holding||holding.quantity+0.0000001<quantity))return 'Not enough shares to sell.';
  if(cloud){
   if(!db)return 'Cloud account is unavailable.';
   setBusy(true);
   try{
    const {error}=await db.rpc('spats_paper_trade',{p_asset_type:stock.asset,p_asset_id:stock.id,p_side:side,p_quantity:quantity});
    if(error)return error.message;
    setFeedback((side==='buy'?'Bought ':'Sold ')+quantity+' '+stock.name+' shares in your verified cloud paper account.');
    setCloudRevision(v=>v+1);
    return null;
   }catch(e){return e instanceof Error?e.message:'Unable to trade.'}
   finally{setBusy(false)}
  }
  const cost=side==='sell'&&holding?round(holding.costBasis*(quantity/holding.quantity)):0;
  const pnl=side==='sell'?round(amount-cost):0;
  const positions=account.positions.filter(p=>p.key!==key);
  if(side==='buy')positions.push({key,asset:stock.asset,id:stock.id,name:stock.name,quantity:qtyRound((holding?.quantity||0)+quantity),costBasis:round((holding?.costBasis||0)+amount)});
  else if(holding){const left=qtyRound(holding.quantity-quantity);if(left>0)positions.push({...holding,quantity:left,costBasis:round(Math.max(0,holding.costBasis-cost))})}
  const record:PaperTrade={id:Date.now().toString(),at:new Date().toISOString(),side,key,name:stock.name,quantity,price:stock.price,total:amount,realizedPnl:pnl};
  setAccount({...account,cash:round(account.cash+(side==='buy'?-amount:amount)),positions,trades:[record,...account.trades].slice(0,500),realizedPnl:round(account.realizedPnl+pnl)});
  setFeedback((side==='buy'?'Bought ':'Sold ')+quantity+' '+stock.name+' shares for '+usd(amount)+' in local simulated funds.');
  return null;
 };
 const reset=()=>{if(cloud){setFeedback('Cloud balances cannot be reset locally.');return}
  setAccount(initial());setFeedback('Local simulated account reset to '+usd(START)+'.')};
 return {account,hydrated,feedback,cloud,cloudNotice,username,busy,trade,reset};
}

export function PaperOrder({stock,availableCash,onTrade,notice}:{stock:PaperAsset;availableCash:number;onTrade:(stock:PaperAsset,side:'buy'|'sell',quantity:number)=>Promise<string|null>;notice:(message:string)=>void}){
 const [side,setSide]=useState<'buy'|'sell'>('buy');
 const [quantity,setQuantity]=useState('1');
 const count=Number(quantity);
 const amount=stock.price!==null&&Number.isFinite(count)?round(stock.price*count):null;
 const blocked=stock.priceStatus==='preview'||stock.price===null;
 const insufficientCash=side==='buy'&&amount!==null&&amount>availableCash+0.00001;
 const maxShares=(()=>{
  if(blocked||stock.price===null||stock.price<=0||availableCash<0.01)return 0;
  let units=Math.min(1000000000,Math.floor((availableCash/stock.price)*10000+1e-8));
  // Orders settle to cents: never autofill an order that rounds beyond cash.
  while(units>0&&round(stock.price*(units/10000))>availableCash)units--;
  return units/10000;
 })();
 const [submitting,setSubmitting]=useState(false);
 async function submit(e:React.FormEvent){
  e.preventDefault();
  if(insufficientCash){notice('Insufficient cash: this order costs '+usd(amount!)+' but you only have '+usd(availableCash)+'. Use Buy Max to fill an affordable amount.');return}
  setSubmitting(true);
  try{const response=await onTrade(stock,side,count);notice(response||'Simulated order executed.');}
  finally{setSubmitting(false)}
 }
 return <section className="stock-paper-order">
  <div className="stock-paper-order-header"><div><span className="stock-overline">PAPER EXCHANGE</span><h3>Trade {stock.name}</h3></div><small>Simulated funds only</small></div>
  <form onSubmit={submit}>
   <div className="stock-paper-choice"><button type="button" className={side==='buy'?'active buy':''} onClick={()=>setSide('buy')}>Buy</button><button type="button" className={side==='sell'?'active sell':''} onClick={()=>setSide('sell')}>Sell</button></div>
   <label htmlFor="stock-paper-quantity">Shares (fractional supported)</label>
   <div className="stock-paper-quantity-row"><input id="stock-paper-quantity" type="number" min="0.0001" max="100000" step="0.0001" value={quantity} onChange={e=>setQuantity(e.target.value)}/>{side==='buy'&&<button className="stock-paper-buy-max" type="button" disabled={blocked||maxShares<=0} onClick={()=>setQuantity(maxShares.toFixed(4))}>Buy Max</button>}</div>
   {side==='buy'&&<div className="stock-paper-balance">Available cash: <strong>{usd(availableCash)}</strong>{maxShares>0&&<small>Maximum affordable: {maxShares.toFixed(4)} shares</small>}</div>}
   {insufficientCash&&<p className="stock-paper-insufficient" role="alert">Insufficient cash. Your order is {usd(amount!)} but you have {usd(availableCash)} available. Reduce shares or use Buy Max.</p>}
   <div className="stock-paper-order-summary"><span>Market reference: {stock.price===null?'—':usd(stock.price)}</span><strong>Order: {amount===null?'—':usd(amount)}</strong></div>
   {blocked&&<p className="stock-muted">{stock.priceStatus==='preview'?'Player preview prices are research only until V5 publishes verified prices.':'This stock has no verified price.'}</p>}
   <button className="stock-paper-submit" type="submit" disabled={submitting||blocked||insufficientCash||!Number.isFinite(count)||count<=0}>{submitting?'Processing…':side==='buy'?'Buy simulated shares':'Sell simulated shares'}</button>
  </form>
 </section>;
}

export function PaperPortfolio({account,assets,onOpen,onReset,cloud=false}:{account:PaperAccount;assets:PaperAsset[];onOpen:(asset:PaperAsset)=>void;onReset:()=>void;cloud?:boolean}){
 const byId=useMemo(()=>new Map(assets.map(asset=>[assetKey(asset),asset])),[assets]);
 const valuation=account.positions.reduce((sum,p)=>sum+p.quantity*(byId.get(p.key)?.price??p.costBasis/p.quantity),0);
 const investedCost=account.positions.reduce((sum,p)=>sum+p.costBasis,0);
 const unrealized=round(valuation-investedCost);
 const equity=round(account.cash+valuation);
 return <section className="stock-panel stock-paper-portfolio">
  <div className="stock-panel-heading"><div><span className="stock-overline">SIMULATED TRADING · NO REAL MONEY</span><h2>My Portfolio</h2><p className="stock-muted">Practice buying and selling stocks at published model prices. {cloud?'Your paper wallet and trades are stored in your SPATS account.':'Your paper wallet is stored only in this browser until cloud trading is enabled.'}</p></div></div>
  <div className="stock-paper-metrics"><div><span>Available cash</span><strong>{usd(account.cash)}</strong></div><div><span>Portfolio value</span><strong>{usd(equity)}</strong></div><div><span>Unrealized P/L</span><strong className={unrealized>=0?'stock-up':'stock-down'}>{usd(unrealized)}</strong></div><div><span>Realized P/L</span><strong className={account.realizedPnl>=0?'stock-up':'stock-down'}>{usd(account.realizedPnl)}</strong></div></div>
  <div className="stock-paper-split"><div><h3>Holdings</h3><div className="stock-table-scroll"><table className="stock-table"><thead><tr><th>Stock</th><th>Shares</th><th>Avg cost</th><th>Market value</th><th>Unrealized P/L</th></tr></thead><tbody>
   {account.positions.map(p=>{const item=byId.get(p.key);const price=item?.price??p.costBasis/p.quantity;const value=round(p.quantity*price);const pnl=round(value-p.costBasis);return <tr key={p.key} onClick={()=>item&&onOpen(item)}><td>{p.name}</td><td>{p.quantity.toFixed(4)}</td><td>{usd(p.costBasis/p.quantity)}</td><td>{usd(value)}</td><td className={pnl>=0?'stock-up':'stock-down'}>{usd(pnl)}</td></tr>})}
  </tbody></table></div>{!account.positions.length&&<p className="stock-muted">No shares yet. Open any team stock to make your first simulated trade.</p>}</div>
  <div><h3>Recent trades</h3><div className="stock-paper-trades">{account.trades.slice(0,12).map(t=><div key={t.id}><span className={t.side==='buy'?'stock-up':'stock-down'}>{t.side.toUpperCase()}</span><strong>{t.name}</strong><small>{t.quantity.toFixed(4)} shares · {usd(t.total)}</small><small>{new Date(t.at).toLocaleString()}</small></div>)}</div>{!account.trades.length&&<p className="stock-muted">Trades will appear here.</p>}</div></div>
  <div className="stock-paper-bottom"><span>Starting balance: {usd(START)} · Simulated trading does not affect stock prices.</span>{!cloud&&<button onClick={()=>{if(window.confirm('Reset your simulated portfolio and delete its local trading history?'))onReset()}}>Reset simulated portfolio</button>}</div>
 </section>;
}
