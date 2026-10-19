'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db} from '../../../lib/supabase';
type Model={name:string;weights:Record<string,number>;start:number;end:number};
type Game={game_id:string;season:number;week:number;date:string;home:string;away:string;pick:string|null;winner:string|null;correct:boolean|null};
type Odds={game_id:string;season:string;week:string;home_team:string;away_team:string;home_moneyline:string;away_moneyline:string};
type Bet={game:Game;odds:number;profit:number;payout:number};
const dollars=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
export default function BettingSimulator(){
 const [models,setModels]=useState<Model[]>([]),[chosen,setChosen]=useState(''),[start,setStart]=useState(2023),[end,setEnd]=useState(2025),[stake,setStake]=useState('25'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[bets,setBets]=useState<Bet[]|null>(null),[skipped,setSkipped]=useState(0);
 useEffect(()=>{if(!db){setMessage('Supabase is not configured.');return}const client=db;let active=true;const load=async()=>{const {data:{user}}=await client.auth.getUser();if(!active)return;if(!user){setMessage('Sign in to the Football Model Lab to use your saved models.');return}const {data,error}=await client.from('football_saved_models').select('name,model_data').eq('user_id',user.id).order('updated_at',{ascending:false});if(!active)return;if(error){setMessage(error.message);return}const list=(data||[]).map(r=>({...r.model_data as Model,name:r.name}));setModels(list);setChosen(list[0]?.name||'');if(!list.length)setMessage('Save a model in the Football Model Lab first.');};void load();return()=>{active=false}},[]);
 const compute=async()=>{const model=models.find(m=>m.name===chosen),amount=Number(stake);if(!model||!Number.isFinite(amount)||amount<=0||start>end){setMessage('Select a saved model, valid seasons, and a positive stake.');return}setBusy(true);setMessage('');setBets(null);try{
  const [prediction,market]=await Promise.all([fetch('/api/football',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({weights:model.weights,start,end})}),fetch('/api/football/betting-odds')]);
  const [p,o]=await Promise.all([prediction.json(),market.json()]);if(!prediction.ok||!market.ok)throw Error(p.error||o.error||'Unable to compute');
  const byId=new Map<string,Odds>((o.games as Odds[]).map(g=>[g.game_id,g]));
  const byTeams=new Map<string,Odds>((o.games as Odds[]).map(g=>[[g.season,g.week,g.home_team,g.away_team].join('|'),g]));
  const results:Bet[]=[];let missing=0;
  for(const g of p.games as Game[]){if(!g.pick||!g.winner){missing++;continue}
   const line=byId.get(g.game_id)||byTeams.get([g.season,g.week,g.home,g.away].join('|'));
   const price=Number(g.pick===g.home?line?.home_moneyline:line?.away_moneyline);
   if(!line||!Number.isFinite(price)||price===0||!((g.pick===g.home?line.home_moneyline:line.away_moneyline)||'').trim()){missing++;continue}
   const profit=g.pick===g.winner?(price>0?amount*price/100:amount*100/Math.abs(price)):-amount;
   results.push({game:g,odds:price,profit,payout:profit>0?amount+profit:0});
  }
  setBets(results);setSkipped(missing);
 }catch(e){setMessage(String(e))}finally{setBusy(false)}};
 const wins=bets?.filter(b=>b.profit>0).length||0,losses=(bets?.length||0)-wins,net=bets?.reduce((s,b)=>s+b.profit,0)||0,total=bets?.reduce((s,b)=>s+b.payout,0)||0;
 const years=Array.from({length:12},(_,i)=>2015+i);
 return <main style={{maxWidth:1100,margin:'0 auto',padding:'32px 20px',color:'var(--foreground,inherit)'}}>
 <Link href="/football">← Football Model Lab</Link>
 <h1>SPATS Betting Simulator</h1><p>Backtest your saved NFL prediction model against historical closing moneylines. Hypothetical results only; no bets are placed.</p>
 <section style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'end',padding:'20px 0'}}>
 <label>Saved model<br/><select value={chosen} onChange={e=>setChosen(e.target.value)} style={{padding:10,minWidth:210}}>{models.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select></label>
 <label>Start season<br/><select value={start} onChange={e=>setStart(Number(e.target.value))} style={{padding:10}}>{years.map(y=><option key={y}>{y}</option>)}</select></label>
 <label>End season<br/><select value={end} onChange={e=>setEnd(Number(e.target.value))} style={{padding:10}}>{years.map(y=><option key={y}>{y}</option>)}</select></label>
 <label>Bet per game ($)<br/><input type="number" min=".01" step=".01" value={stake} onChange={e=>setStake(e.target.value)} style={{padding:10,width:130}}/></label>
 <button onClick={compute} disabled={busy||!chosen||start>end} style={{padding:'12px 22px',background:'#d8a52c',color:'#111',border:0,borderRadius:8,fontWeight:700,cursor:'pointer'}}>{busy?'Computing…':'Compute'}</button>
 </section>
 {message&&<p role="alert">{message}</p>}
 {bets&&<><section style={{display:'flex',gap:16,flexWrap:'wrap',margin:'22px 0'}}>{[['Net profit/loss',dollars(net)],['Wins',String(wins)],['Losses',String(losses)],['Win rate',bets.length?(wins/bets.length*100).toFixed(1)+'%':'—'],['Total returned',dollars(total)],['Games excluded',String(skipped)]].map(([label,value])=><div key={label} style={{padding:18,border:'1px solid #8886',borderRadius:10,minWidth:145}}><small>{label}</small><h2 style={{margin:'8px 0'}}>{value}</h2></div>)}</section>
 <p>Staked: {dollars(bets.length*Number(stake))}. Total returned includes winning stakes; net profit/loss subtracts all wagers. Games without a final result, model pick, or verified historical moneyline are excluded.</p>
 <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}><thead><tr>{['Season / Week','Matchup','Model pick','Moneyline','Result','Profit / Loss','Total payout'].map(h=><th key={h} style={{padding:10,borderBottom:'1px solid #8888'}}>{h}</th>)}</tr></thead><tbody>{bets.map((b,i)=><tr key={b.game.game_id+'-'+i} style={{background:b.profit>0?'rgba(34,197,94,.10)':'rgba(239,68,68,.10)'}}><td style={{padding:10}}>{b.game.season} / {b.game.week}</td><td>{b.game.away} @ {b.game.home}</td><td>{b.game.pick}</td><td>{b.odds>0?'+':''}{b.odds}</td><td>{b.profit>0?'Win':'Loss'}</td><td>{dollars(b.profit)}</td><td>{dollars(b.payout)}</td></tr>)}</tbody></table></div>
 </>}
 <p style={{marginTop:24,fontSize:13,opacity:.8}}>Source: nflverse historical market data. Closing prices are not independently verified as a specific sportsbook's final pre-kickoff quote. This simulator currently tests moneyline bets only. Historical results do not predict future returns.</p>
 </main>
}
