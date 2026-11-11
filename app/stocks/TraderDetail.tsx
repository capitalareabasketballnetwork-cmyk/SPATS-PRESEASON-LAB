'use client';
import {useEffect,useMemo,useState} from 'react';
import {db} from '../../lib/supabase';
import {usd} from './PaperExchange';

type Position={asset:string;id:string;name:string;quantity:number;avgCost:number;costBasis:number;currentPrice:number;marketValue:number;unrealizedPnl:number};
type Point={at:string;value:number;cash:number;holdingsValue:number;source:string};
type Detail={username:string;cash:number;portfolioValue:number;holdingsValue:number;realizedPnl:number;positions:Position[];history:Point[]};

function EquityChart({points}:{points:Point[]}){
 const ordered=useMemo(()=>[...points].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),[points]);
 if(!ordered.length)return <div className="stock-trader-chart-empty">No verified snapshots have been captured yet. The chart starts recording after the portfolio-history SQL is installed.</div>;
 const vals=ordered.map(p=>Number(p.value)).filter(Number.isFinite);
 if(vals.length!==ordered.length)return <p className="stock-muted">Historical data unavailable.</p>;
 const w=720,h=250,l=65,r=20,t=22,b=35;
 const min=Math.min(...vals),max=Math.max(...vals);
 const pad=Math.max(3,(max-min)*.13);
 const low=min-pad,high=max+pad;
 const firstTime=Date.parse(ordered[0].at),lastTime=Date.parse(ordered[ordered.length-1].at);
 const x=(i:number)=>firstTime===lastTime?l+(w-l-r)/2:l+(Date.parse(ordered[i].at)-firstTime)/(lastTime-firstTime)*(w-l-r);
 const y=(value:number)=>t+(high-value)/(high-low)*(h-t-b);
 const path=ordered.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(Number(p.value)).toFixed(1)).join(' ');
 const positive=vals[vals.length-1]>=vals[0];
 return <div className="stock-trader-graph">
  <svg viewBox={'0 0 '+w+' '+h} role="img" aria-label="Recorded portfolio value over time">
   {[0,1,2,3,4].map(i=>{const v=high-(high-low)*i/4;return <g key={i}><line x1={l} x2={w-r} y1={y(v)} y2={y(v)} stroke="#415574" strokeDasharray="3 6"/><text x={l-7} y={y(v)+3} textAnchor="end" fill="#a9bdd8" fontSize="11">{usd(v)}</text></g>})}
   {ordered.length>1&&<path d={path} fill="none" stroke={positive?'#29d49f':'#ff7f90'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
   {ordered.map((p,i)=><circle key={i} cx={x(i)} cy={y(Number(p.value))} r={ordered.length>60?2.5:4} fill={positive?'#29d49f':'#ff7f90'} stroke="#102138" strokeWidth="1"><title>{new Date(p.at).toLocaleString()} · {usd(Number(p.value))} · {p.source}</title></circle>)}
   <text x={l} y={h-7} fill="#a4b9d5" fontSize="11">{new Date(ordered[0].at).toLocaleDateString()}</text>
   <text x={w-r} y={h-7} textAnchor="end" fill="#a4b9d5" fontSize="11">{new Date(ordered[ordered.length-1].at).toLocaleDateString()}</text>
  </svg>
  <div className="stock-trader-graph-meta"><span>{ordered.length} recorded valuation{ordered.length===1?'':'s'}</span><span>Latest recorded: {usd(Number(ordered[ordered.length-1].value))}</span></div>
  {ordered.length<2&&<p className="stock-muted">The first verified snapshot is shown. More points will appear after trades and daily price updates.</p>}
 </div>;
}

export default function TraderDetail({userId,onClose}:{userId:string;onClose:()=>void}){
 const [details,setDetails]=useState<Detail|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  (async()=>{
   setLoading(true);setError('');setDetails(null);
   if(!db){if(active){setError('Supabase unavailable.');setLoading(false)}return}
   const {data,error:err}=await db.rpc('spats_paper_trader_details',{p_user_id:userId});
   if(!active)return;
   if(err){setError('Portfolio details are not available yet. Install the SPATS trader profiles and history SQL in Supabase.')}
   else if(data){const d=data as Detail;setDetails({...d,cash:Number(d.cash),portfolioValue:Number(d.portfolioValue),holdingsValue:Number(d.holdingsValue),realizedPnl:Number(d.realizedPnl),positions:(d.positions||[]).map(p=>({...p,quantity:Number(p.quantity),avgCost:Number(p.avgCost),costBasis:Number(p.costBasis),currentPrice:Number(p.currentPrice),marketValue:Number(p.marketValue),unrealizedPnl:Number(p.unrealizedPnl)})),history:(d.history||[]).map(p=>({...p,value:Number(p.value),cash:Number(p.cash),holdingsValue:Number(p.holdingsValue)}))})}
   setLoading(false);
  })();
  return()=>{active=false};
 },[userId]);
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};
  document.addEventListener('keydown',key);
  return()=>document.removeEventListener('keydown',key);
 },[onClose]);
 return <div className="stock-trader-backdrop" role="presentation" onMouseDown={onClose}>
  <div className="stock-trader-modal" role="dialog" aria-modal="true" aria-label="Trader portfolio details" onMouseDown={e=>e.stopPropagation()}>
   <div className="stock-trader-modal-header"><div><span className="stock-overline">SPATS TRADER PROFILE</span><h2>{details?'@'+details.username:'Trader portfolio'}</h2><p className="stock-muted">Public simulated holdings and historical portfolio performance</p></div><button onClick={onClose} aria-label="Close trader portfolio">✕</button></div>
   {loading&&<p className="stock-muted">Loading trader portfolio…</p>}
   {error&&<div className="stock-price-history-notice">{error}</div>}
   {details&&<><div className="stock-trader-metrics">
     <div><small>Portfolio value</small><strong>{usd(details.portfolioValue)}</strong></div>
     <div><small>Available cash</small><strong>{usd(details.cash)}</strong></div>
     <div><small>Investments</small><strong>{usd(details.holdingsValue)}</strong></div>
     <div><small>Total return</small><strong className={details.portfolioValue>=10000?'stock-up':'stock-down'}>{details.portfolioValue>=10000?'+':''}{usd(details.portfolioValue-10000)}</strong></div>
   </div>
   <section className="stock-trader-section"><div className="stock-trader-section-head"><h3>Portfolio value history</h3><span>Recorded snapshots</span></div><EquityChart points={details.history}/></section>
   <section className="stock-trader-section"><div className="stock-trader-section-head"><h3>Current holdings</h3><span>{details.positions.length} stock{details.positions.length===1?'':'s'}</span></div>
    {details.positions.length?<div className="stock-table-scroll"><table className="stock-table"><thead><tr><th>Stock</th><th>Shares</th><th>Avg. cost</th><th>Current price</th><th>Market value</th><th>Unrealized P/L</th></tr></thead><tbody>
     {details.positions.map(p=><tr key={p.asset+':'+p.id}><td><strong>{p.name}</strong><small className="stock-muted"> {p.asset}</small></td><td>{p.quantity.toFixed(4)}</td><td>{usd(p.avgCost)}</td><td>{usd(p.currentPrice)}</td><td>{usd(p.marketValue)}</td><td className={p.unrealizedPnl>=0?'stock-up':'stock-down'}>{p.unrealizedPnl>=0?'+':''}{usd(p.unrealizedPnl)}</td></tr>)}
    </tbody></table></div>:<p className="stock-muted">This trader currently holds no shares.</p>}
   </section></>}
   <p className="stock-trader-footnote">Simulated investments only. Chart points reflect recorded snapshots, not an estimated or invented historical price path.</p>
  </div>
 </div>;
}
