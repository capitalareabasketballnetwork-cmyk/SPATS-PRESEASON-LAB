'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db} from '../../../lib/supabase';
type Model={name:string;weights:Record<string,number>;source?:string};
type Metric={profit:number;roi:number;accuracy:number|null;bets:number;confidence:number|null};
type Entry={model:Model;moneyline:Metric;spread:Metric;total:Metric;error?:string};
const money=(n:number)=>(n>=0?'+':'')+n.toLocaleString('en-US',{style:'currency',currency:'USD'});
export default function ComparePage(){
 const [models,setModels]=useState<Model[]>([]),[entries,setEntries]=useState<Entry[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [start,setStart]=useState(2023),[end,setEnd]=useState(2025),[stake,setStake]=useState('25.00');
 useEffect(()=>{const p=new URLSearchParams(location.search);const a=Number(p.get('start')),b=Number(p.get('end')),c=p.get('stake');if(a>=2015&&a<=2026)setStart(a);if(b>=2015&&b<=2026)setEnd(b);if(c&&Number(c)>0)setStake(c);
 db?.auth.getUser().then(async({data})=>{if(!data.user||!db){setError('Sign in to compare your saved models.');setLoading(false);return}
 const {data:rows,error:e}=await db.from('football_saved_models').select('name,model_data').eq('user_id',data.user.id).order('updated_at',{ascending:false});
 if(e)setError(e.message);else setModels((rows||[]).map(row=>({...row.model_data as Model,name:row.name})));setLoading(false)})},[]);
 const compare=async()=>{if(start>end||Number(stake)<=0){setError('Choose a valid year range and wager amount.');return}setBusy(true);setEntries([]);setError('');
 try{const results:Entry[]=[];for(const model of models){
 const modelResponse=await fetch('/api/football',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({weights:model.weights,start:2015,end})});
 const predictions=await modelResponse.json();if(!modelResponse.ok)throw Error(predictions.error||'Could not calculate '+model.name);
 const [moneyRes,scoreRes]=await Promise.all([fetch('/api/football/odds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({games:predictions.games,start,end,stake:Number(stake)})}),fetch('/api/football/score-lab',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({games:predictions.games,start,end,stake:Number(stake)})})]);
 const ml=await moneyRes.json(),sc=await scoreRes.json();if(!moneyRes.ok||!scoreRes.ok)throw Error(ml.error||sc.error||'Betting calculation failed');
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
 results.push({model,moneyline,spread:metric('spread'),total:metric('total')});setEntries([...results]);
 }}catch(e){setError(String(e))}finally{setBusy(false)}};
 const detail=(m:Model,market:string)=>'/football?tab=odds&model='+encodeURIComponent(m.name)+'&market='+market+'&start='+start+'&end='+end;
 return <main className="nfl-lab nfl-compare-page"><div className="eyebrow">SPATS · FOOTBALL ANALYTICS</div><h1>Compare Saved Models</h1><p className="note">Compare historical accuracy, simulated profit, and ROI across your saved models. Moneyline uses its best historical confidence cutoff; spread and totals include all priced bets because those markets have no calibrated confidence ratings.</p>
 <div className="panel"><div className="nfl-compare-controls"><label>Start season<select value={start} onChange={e=>setStart(Number(e.target.value))}>{Array.from({length:12},(_,i)=>2015+i).map(y=><option key={y}>{y}</option>)}</select></label><label>End season<select value={end} onChange={e=>setEnd(Number(e.target.value))}>{Array.from({length:12},(_,i)=>2015+i).map(y=><option key={y}>{y}</option>)}</select></label><label>Bet amount ($)<input type="number" min="0.01" step="0.01" value={stake} onChange={e=>setStake(e.target.value)}/></label><button className="primary" disabled={busy||loading||!models.length} onClick={()=>void compare()}>{busy?'Comparing models…':'Compare '+models.length+' Models'}</button></div>{error&&<p className="notice" role="alert">{error}</p>}{loading&&<p>Loading saved models…</p>}</div>
 <div className="nfl-compare-grid">{(entries.length?entries:models.map(model=>({model,moneyline:null,spread:null,total:null}))).map(item=><article className="panel nfl-compare-card" key={item.model.name}><h2>{item.model.source==='ai-advisor'?'✦ ':''}{item.model.name}</h2>{(['moneyline','spread','total'] as const).map(key=>{const m=item[key];return <Link href={detail(item.model,key)} key={key} className="nfl-compare-market"><strong>{key==='moneyline'?'$ Moneyline':key==='spread'?'± Spread':'↑ / ↓ Over/Under'}</strong>{m?<><span>{m.accuracy===null?'—':m.accuracy.toFixed(1)+'%'} correct · {m.bets} bets</span><b className={m.profit>=0?'positive':'negative'}>{money(m.profit)} · {m.roi.toFixed(1)}% ROI</b><small>{m.confidence!==null?'Best historical confidence '+m.confidence+'%+':'No calibrated market confidence'}</small></>:<span>Compute comparison to view results</span>}</Link>})}</article>)}</div>
 {busy&&<p className="note">Models are evaluated sequentially to reduce server load. Results appear as each model finishes.</p>}<p className="note">Ideal Moneyline confidence is selected using hindsight on the same historical sample; it does not predict future profitability. Click any market to open that model in the Odds Calculator.</p></main>
}
