'use client';
import {useEffect,useMemo,useState} from 'react';

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
 useEffect(()=>{setAccount(readAccount());setHydrated(true)},[]);
 useEffect(()=>{if(hydrated){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(account))}catch{setFeedback('Browser storage is unavailable. Trades may not persist.') }}},[account,hydrated]);

 const trade=(stock:PaperAsset,side:'buy'|'sell',quantity:number)=>{
  if(!hydrated)return 'Account is loading.';
  if(stock.priceStatus==='preview')return 'Trading preview player prices is disabled until V5 is published.';
  if(stock.price===null||!Number.isFinite(stock.price)||stock.price<=0)return 'No verified price is available for this stock.';
  if(!Number.isFinite(quantity)||quantity<=0||quantity>100000||qtyRound(quantity)!==quantity)return 'Enter a positive quantity with at most four decimal places.';
  const amount=round(stock.price*quantity);
  if(amount<0.01)return 'Minimum order value is $0.01.';
  const key=assetKey(stock);
  const holding=account.positions.find(p=>p.key===key);
  if(side==='buy'&&amount>account.cash+0.00001)return 'Not enough simulated cash.';
  if(side==='sell'&&(!holding||holding.quantity+0.0000001<quantity))return 'Not enough shares to sell.';
  const cost=side==='sell'&&holding?round(holding.costBasis*(quantity/holding.quantity)):0;
  const pnl=side==='sell'?round(amount-cost):0;
  const positions=account.positions.filter(p=>p.key!==key);
  if(side==='buy'){
   positions.push({key,asset:stock.asset,id:stock.id,name:stock.name,quantity:qtyRound((holding?.quantity||0)+quantity),costBasis:round((holding?.costBasis||0)+amount)});
  }else if(holding){
   const left=qtyRound(holding.quantity-quantity);
   if(left>0)positions.push({...holding,quantity:left,costBasis:round(Math.max(0,holding.costBasis-cost))});
  }
  const record:PaperTrade={id:(typeof crypto!=='undefined'&&'randomUUID'in crypto)?crypto.randomUUID():Date.now().toString(),at:new Date().toISOString(),side,key,name:stock.name,quantity,price:stock.price,total:amount,realizedPnl:pnl};
  setAccount({...account,cash:round(account.cash+(side==='buy'?-amount:amount)),positions,trades:[record,...account.trades].slice(0,500),realizedPnl:round(account.realizedPnl+pnl)});
  setFeedback((side==='buy'?'Bought ':'Sold ')+quantity+' '+stock.name+' shares for '+usd(amount)+' in simulated funds.');
  return null;
 };
 const clearFeedback=()=>setFeedback('');
 const reset=()=>{setAccount(initial());setFeedback('Simulated account reset to '+usd(START)+'.')};
 return {account,hydrated,feedback,clearFeedback,trade,reset};
}

export function PaperOrder({stock,onTrade,notice}:{stock:PaperAsset;onTrade:(stock:PaperAsset,side:'buy'|'sell',quantity:number)=>string|null;notice:(message:string)=>void}){
 const [side,setSide]=useState<'buy'|'sell'>('buy');
 const [quantity,setQuantity]=useState('1');
 const count=Number(quantity);
 const amount=stock.price!==null&&Number.isFinite(count)?round(stock.price*count):null;
 const blocked=stock.priceStatus==='preview'||stock.price===null;
 function submit(e:React.FormEvent){e.preventDefault();const response=onTrade(stock,side,count);notice(response||'Order executed using the latest displayed simulated market price.')}
 return <section className="stock-paper-order">
  <div className="stock-paper-order-header"><div><span className="stock-overline">PAPER EXCHANGE</span><h3>Trade {stock.name}</h3></div><small>Simulated funds only</small></div>
  <form onSubmit={submit}>
   <div className="stock-paper-choice"><button type="button" className={side==='buy'?'active buy':''} onClick={()=>setSide('buy')}>Buy</button><button type="button" className={side==='sell'?'active sell':''} onClick={()=>setSide('sell')}>Sell</button></div>
   <label htmlFor="stock-paper-quantity">Shares (fractional supported)</label>
   <input id="stock-paper-quantity" type="number" min="0.0001" max="100000" step="0.0001" value={quantity} onChange={e=>setQuantity(e.target.value)}/>
   <div className="stock-paper-order-summary"><span>Market reference: {stock.price===null?'—':usd(stock.price)}</span><strong>Order: {amount===null?'—':usd(amount)}</strong></div>
   {blocked&&<p className="stock-muted">{stock.priceStatus==='preview'?'Player preview prices are research only until V5 publishes verified prices.':'This stock has no verified price.'}</p>}
   <button className="stock-paper-submit" type="submit" disabled={blocked||!Number.isFinite(count)||count<=0}>{side==='buy'?'Buy simulated shares':'Sell simulated shares'}</button>
  </form>
 </section>;
}

export function PaperPortfolio({account,assets,onOpen,onReset}:{account:PaperAccount;assets:PaperAsset[];onOpen:(asset:PaperAsset)=>void;onReset:()=>void}){
 const byId=useMemo(()=>new Map(assets.map(asset=>[assetKey(asset),asset])),[assets]);
 const valuation=account.positions.reduce((sum,p)=>sum+p.quantity*(byId.get(p.key)?.price??p.costBasis/p.quantity),0);
 const investedCost=account.positions.reduce((sum,p)=>sum+p.costBasis,0);
 const unrealized=round(valuation-investedCost);
 const equity=round(account.cash+valuation);
 return <section className="stock-panel stock-paper-portfolio">
  <div className="stock-panel-heading"><div><span className="stock-overline">SIMULATED TRADING · NO REAL MONEY</span><h2>My Portfolio</h2><p className="stock-muted">Practice buying and selling stocks at published model prices. Your balance is stored in this browser, not a bank or exchange.</p></div></div>
  <div className="stock-paper-metrics"><div><span>Available cash</span><strong>{usd(account.cash)}</strong></div><div><span>Portfolio value</span><strong>{usd(equity)}</strong></div><div><span>Unrealized P/L</span><strong className={unrealized>=0?'stock-up':'stock-down'}>{usd(unrealized)}</strong></div><div><span>Realized P/L</span><strong className={account.realizedPnl>=0?'stock-up':'stock-down'}>{usd(account.realizedPnl)}</strong></div></div>
  <div className="stock-paper-split"><div><h3>Holdings</h3><div className="stock-table-scroll"><table className="stock-table"><thead><tr><th>Stock</th><th>Shares</th><th>Avg cost</th><th>Market value</th><th>Unrealized P/L</th></tr></thead><tbody>
   {account.positions.map(p=>{const item=byId.get(p.key);const price=item?.price??p.costBasis/p.quantity;const value=round(p.quantity*price);const pnl=round(value-p.costBasis);return <tr key={p.key} onClick={()=>item&&onOpen(item)}><td>{p.name}</td><td>{p.quantity.toFixed(4)}</td><td>{usd(p.costBasis/p.quantity)}</td><td>{usd(value)}</td><td className={pnl>=0?'stock-up':'stock-down'}>{usd(pnl)}</td></tr>})}
  </tbody></table></div>{!account.positions.length&&<p className="stock-muted">No shares yet. Open any team stock to make your first simulated trade.</p>}</div>
  <div><h3>Recent trades</h3><div className="stock-paper-trades">{account.trades.slice(0,12).map(t=><div key={t.id}><span className={t.side==='buy'?'stock-up':'stock-down'}>{t.side.toUpperCase()}</span><strong>{t.name}</strong><small>{t.quantity.toFixed(4)} shares · {usd(t.total)}</small><small>{new Date(t.at).toLocaleString()}</small></div>)}</div>{!account.trades.length&&<p className="stock-muted">Trades will appear here.</p>}</div></div>
  <div className="stock-paper-bottom"><span>Starting balance: {usd(START)} · Simulated trading does not affect stock prices.</span><button onClick={()=>{if(window.confirm('Reset your simulated portfolio and delete its local trading history?'))onReset()}}>Reset simulated portfolio</button></div>
 </section>;
}
