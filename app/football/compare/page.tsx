'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db} from '../../../lib/supabase';
type Model={name:string;weights:Record<string,number>;source?:string};
type Metric={profit:number;roi:number;accuracy:number|null;bets:number;confidence:number|null};
type Market='moneyline'|'spread'|'total';
type Entry={model:Model;moneyline:Metric;spread:Metric;total:Metric;error?:string};
const money=(n:number)=>(n>=0?'+':'')+n.toLocaleString('en-US',{style:'currency',currency:'USD'});
export default function ComparePage(){
 const [models,setModels]=useState<Model[]>([]),[entries,setEntries]=useState<Entry[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [market,setMarket]=useState<Market>('moneyline'),[selected,setSelected]=useState<string[]>([]);
 const [start,setStart]=useState(2023),[end,setEnd]=useState(2025),[stake,setStake]=useState('25.00');
 useEffect(()=>{const p=new URLSearchParams(location.search);const a=Number(p.get('start')),b=Number(p.get('end')),c=p.get('stake');if(a>=2015&&a<=2026)setStart(a);if(b>=2015&&b<=2026)setEnd(b);if(c&&Number(c)>0)setStake(c);
 db?.auth.getUser().then(async({data})=>{if(!data.user||!db){setError('Sign in to compare your saved models.');setLoading(false);return}
 const {data:rows,error:e}=await db.from('football_saved_models').select('name,model_data').eq('user_id',data.user.id).order('updated_at',{ascending:false});
 if(e)setError(e.message);else {const saved=(rows||[]).map(row=>({...row.model_data as Model,name:row.name}));setModels(saved);setSelected(saved.map(m=>m.name))}setLoading(false)})},[]);
 const compare=async()=>{if(start>end||Number(stake)<=0){setError('Choose a valid year range and wager amount.');return}setBusy(true);setEntries([]);setError('');
 try{const results:Entry[]=[];for(const model of models.filter(m=>selected.includes(m.name))){
 const modelResponse=await fetch('/api/football',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({weights:model.weights,start:2015,end})});
 const predictions=await modelResponse.json();if(!modelResponse.ok)throw Error(predictions.error||'Could not calculate '+model.name);
 const moneyRes=market==='moneyline'?await fetch('/api/football/odds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({games:predictions.games,start,end,stake:Number(stake)})}):null;
 const scoreRes=market!=='moneyline'?await fetch('/api/football/score-lab',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({games:predictions.games,start,end,stake:Number(stake)})}):null;
 const ml=moneyRes?await moneyRes.json():{rows:[]},sc=scoreRes?await scoreRes.json():{rows:[]};if((moneyRes&&!moneyRes.ok)||(scoreRes&&!scoreRes.ok))throw Error(ml.error||sc.error||'Betting calculation failed');
 const eligible=ml.rows.filter((r:{confidence:number|null;profit:number|null})=>typeof r.confidence==='number'&&r.profit!==null);
 let best:{confidence:number;profit:number;count:number}|null=null;
 for(let threshold=0;threshold<=85;threshold++){const rows=eligible.filter((r:{confidence:number})=>r.confidence>=threshold);if(!rows.length)continue;const profit=rows.reduce((sum:number,r:{profit:number})=>sum+r.profit,0);
 if(!best||profit>best.profit+0.001||(Math.abs(profit-best.profit)<0.001&&threshold>best.confidence))best={confidence:threshold,profit,count:rows.length}}
 const winCount=eligible.filter((r:{confidence:number;profit:number;correct:boolean;tie?:boolean})=>r.confidence>=(best?.confidence??0)&&r.correct===true&&!r.tie).length;
 const lossCount=eligible.filter((r:{confidence:number;profit:number;correct:boolean;tie?:boolean})=>r.confidence>=(best?.confidence??0)&&r.correct===false&&!r.tie).length;
 const moneyline:Metric={profit:best?.profit??0,bets:best?.count??0,roi:best?.count?100*best.profit/(best.count*Number(stake)):0,accuracy:winCount+lossCount?100*winCount/(winCount+lossCount):null,confidence:best?.confidence??null};
 const metric=(key:'spread'|'total'):Metric=>{const graded=sc.rows.filter((r:{season:number;[key:string]:unknown})=>r.season>=start&&r.season<=end&&r[key+'Profit']!==null);
 const profit=graded.reduce((sum:number,r:Record<string,number>)=>sum+r[key+'Profit'],0);const wins=graded.filter((r:Record<string,string>)=>r[key+'Outcome']==='win').length;const losses=graded.filter((r:Record<string,string>)=>r[key+'Outcome']==='loss').length;
 return {profit,bets:graded.length,roi:graded.length?100*profit/(graded.length*Number(stake)):0,accuracy:wins+losses?100*wins/(wins+losses):null,confidence:null}};
 results.push({model,moneyline,spread:market==='spread'?metric('spread'):moneyline,total:market==='total'?metric('total'):moneyline});setEntries([...results]);
 }}catch(e){setError(String(e))}finally{setBusy(false)}};
 const detail=(m:Model,market:string)=>'/football?tab=odds&model='+encodeURIComponent(m.name)+'&market='+market+'&start='+start+'&end='+end;
 const allSelected=models.length>0&&selected.length===models.length;
 const changeMarket=(value:Market)=>{setMarket(value);setEntries([])};
 return <main className="nfl-lab nfl-compare-page"><Link className="nfl-back-link" href="/football?tab=odds">← Back to Odds Calculator</Link><div className="eyebrow">SPATS · FOOTBALL ANALYTICS</div><h1>Compare Saved Models</h1><p className="note">Choose a betting market and the models to compare. Results use historical closing lines and a flat wager per eligible game.</p>
 <section className="panel nfl-compare-setup"><h2>Configure comparison</h2><div className="nfl-market-picker" role="group" aria-label="Bet type">{([['moneyline','Moneyline','$'],['spread','Spread','+ −'],['total','Over/Under','↑ / ↓']] as [Market,string,string][]).map(([id,label,symbol])=><button key={id} type="button" className={market===id?'active':''} aria-pressed={market===id} onClick={()=>changeMarket(id)}><span className="nfl-market-symbol">{symbol}</span><span className="nfl-market-label">{label}</span></button>)}</div>
 <div className="nfl-compare-controls"><label>Start season<span className="nfl-select-wrap"><select value={start} onChange={e=>{setStart(Number(e.target.value));setEntries([])}}>{Array.from({length:12},(_,i)=>2015+i).map(y=><option key={y}>{y}</option>)}</select></span></label><label>End season<span className="nfl-select-wrap"><select value={end} onChange={e=>{setEnd(Number(e.target.value));setEntries([])}}>{Array.from({length:12},(_,i)=>2015+i).map(y=><option key={y}>{y}</option>)}</select></span></label><label>Bet amount ($)<input type="number" min="0.01" step="0.01" value={stake} onChange={e=>{setStake(e.target.value);setEntries([])}}/></label></div>
 <div className="nfl-compare-select-heading"><h3>Select models <small>({selected.length} of {models.length})</small></h3><label className="nfl-compare-select-all"><input type="checkbox" checked={allSelected} onChange={e=>{setSelected(e.target.checked?models.map(m=>m.name):[]);setEntries([])}}/> Select / Unselect All</label></div>
 <div className="nfl-compare-model-list">{models.map(m=><label key={m.name} className={'nfl-compare-model-row '+(selected.includes(m.name)?'is-selected':'')}><input type="checkbox" checked={selected.includes(m.name)} onChange={e=>{setSelected(prev=>e.target.checked?[...prev,m.name]:prev.filter(n=>n!==m.name));setEntries([])}}/><span>{m.source==='ai-advisor'&&<b className="nfl-ai-star">✦ </b>}{m.name}</span></label>)}</div>
 {!models.length&&!loading&&<p className="note">No saved models found. <Link href="/football">Create a model</Link> first.</p>}
 <button className="nfl-compare-submit" disabled={busy||loading||!selected.length||start>end||Number(stake)<=0} onClick={()=>void compare()}>{busy?'Comparing '+selected.length+' models…':'Compare '+selected.length+' Selected Model'+(selected.length===1?'':'s')+' →'}</button>
 {error&&<p className="notice" role="alert">{error}</p>}{loading&&<p className="note">Loading saved models…</p>}</section>
 {entries.length>0&&<><div className="nfl-compare-results-title"><h2>{market==='moneyline'?'Moneyline':market==='spread'?'Against the Spread':'Over / Under'} comparison</h2><p className="note">{start}–{end} · {money(Number(stake))} wager per game · Click a model to open it in the Odds Calculator.</p></div>
 <div className="nfl-compare-grid">{[...entries].sort((a,b)=>b[market].profit-a[market].profit).map((item,index)=>{const m=item[market];return <Link href={detail(item.model,market)} className={'panel nfl-compare-card nfl-compare-result '+(m.profit>0?'nfl-compare-win':m.profit<0?'nfl-compare-loss':'nfl-compare-even')} key={item.model.name}><div className="nfl-compare-rank">#{index+1} · {m.profit>0?'PROFIT':m.profit<0?'LOSS':'BREAK EVEN'}</div><h3>{item.model.source==='ai-advisor'?'✦ ':''}{item.model.name}</h3><div className={'nfl-compare-profit '+(m.profit>=0?'positive':'negative')}>{money(m.profit)}</div><strong>{m.roi.toFixed(2)}% ROI</strong><div className="nfl-compare-result-stats"><span>{m.accuracy===null?'—':m.accuracy.toFixed(1)+'%'} correct</span><span>{m.bets} bets</span></div><small>{m.confidence!==null?'Best historical confidence '+m.confidence+'%+':'No calibrated '+(market==='spread'?'spread':'total')+' confidence'}</small><span className="nfl-compare-open">Open in Odds Calculator →</span></Link>})}</div></>}
 {busy&&<p className="note">Evaluating selected models sequentially. Results appear as each model finishes.</p>}
 <p className="note">The best Moneyline confidence cutoff is selected using the same historical results; this is an in-sample optimum, not a future-profit guarantee. Spread and Over/Under are not confidence-filtered.</p></main>
}
