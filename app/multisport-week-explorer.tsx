'use client';
import {useEffect,useMemo,useState} from 'react';
import {leagues,backtest,type League,type Game,type WeightMap} from '../lib/multisport-model';
type Saved={name:string;weights:WeightMap;season:number};
const seasonOf=(league:League,date:string)=>{const d=new Date(date);const y=d.getUTCFullYear(),m=d.getUTCMonth()+1;return league==='college-football'?y:m>=8?y+1:y};
const weekOf=(league:League,g:Game,firstDate:string)=>{if(league==='college-football'&&g.week&&g.week>0)return g.week;return Math.max(1,Math.floor((new Date(g.date).getTime()-new Date(firstDate).getTime())/604800000)+1)};
export default function MultisportWeekExplorer({league,saved}:{league:League;saved:Saved[]}){
 const seasons=leagues[league].seasons;
 const [model,setModel]=useState(''),[season,setSeason]=useState<number>(2026),[week,setWeek]=useState(1),[games,setGames]=useState<Game[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[warning,setWarning]=useState('');
 useEffect(()=>{let active=true;setBusy(true);setError('');setWarning('');setGames([]);fetch('/api/multisport?league='+league+'&season='+season).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Schedule unavailable');return d}).then(d=>{if(active){setGames(d.games||[]);setWarning(d.coverageWarning||'')}}).catch(e=>{if(active)setError(String(e))}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[league,season]);
 const modelWeights=saved.find(m=>m.name===model)?.weights;
 const predictions=useMemo(()=>modelWeights?backtest(games,modelWeights):[],[games,modelWeights]);
 const predictionsById=useMemo(()=>new Map(predictions.map(p=>[p.id,p])),[predictions]);
 const seasonGames=useMemo(()=>games.filter(g=>seasonOf(league,g.date)===season).sort((a,b)=>a.date.localeCompare(b.date)),[games,league,season]);
 const firstDate=seasonGames[0]?.date||'';
 const weeks=useMemo(()=>[...new Set(seasonGames.map(g=>weekOf(league,g,firstDate)))].sort((a,b)=>a-b),[seasonGames,league,firstDate]);
 useEffect(()=>{if(weeks.length&&!weeks.includes(week))setWeek(weeks[0])},[weeks,week]);
 const rows=seasonGames.filter(g=>weekOf(league,g,firstDate)===week);
 const graded=rows.map(g=>predictionsById.get(g.id)).filter(p=>p&&p.correct!==null);
 const wins=graded.filter(p=>p?.correct).length;
 const accuracy=graded.length?100*wins/graded.length:null;
 return <section className="panel"><h2>Week Explorer</h2><p className="note">Select a saved model, season and week. Completed games show correct or incorrect picks; future games show predictions when sufficient pregame data exists. Every game returned by the schedule is displayed, even without a pick.</p>
 <div className="nfl-season-inputs"><label>Saved model <select aria-label="Saved model for Week Explorer" value={model} onChange={e=>setModel(e.target.value)}><option value="">Select a saved model…</option>{saved.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select></label><label>Season <select value={season} onChange={e=>{setSeason(Number(e.target.value));setWeek(1)}}>{seasons.map(y=><option key={y} value={y}>{league==='college-football'?y:(y-1)+'–'+String(y).slice(-2)}</option>)}</select></label><label>Week <select value={week} onChange={e=>setWeek(Number(e.target.value))}>{weeks.map(w=><option key={w} value={w}>Week {w}</option>)}</select></label></div>
 {model&&<div className={'nfl-score '+(accuracy===null?'nfl-score-pending':accuracy>=60?'nfl-quality-strong':accuracy>=55?'nfl-quality-moderate':'nfl-quality-weak')}><small>WEEK {week} · {season} PREDICTION ACCURACY</small><strong>{accuracy===null?'—':accuracy.toFixed(2)+'%'}</strong><b>{accuracy===null?'Awaiting graded predictions':wins+' correct · '+(graded.length-wins)+' incorrect'}</b><span>{graded.length} graded predictions</span></div>}
 {busy&&<p className="notice">Loading season schedule…</p>}{error&&<p className="notice" role="alert">{error}</p>}{warning&&<p className="notice">{warning}</p>}{!model&&<p className="note">Select a saved model to view its predictions and historical accuracy.</p>}
 <div className="nfl-week-list">{rows.map(g=>{const p=predictionsById.get(g.id);const status=p?.correct===true?'nfl-week-correct':p?.correct===false?'nfl-week-incorrect':'nfl-week-neutral';const confidence=p?Math.abs(p.edge)>=.65?'High':Math.abs(p.edge)>=.3?'Medium':'Low':null;return <div className={'nfl-week-row '+status} key={g.id}><span className="nfl-week-matchup"><strong>{g.away} @ {g.home}</strong><small>{new Date(g.date).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</small></span><span className="nfl-week-score">{g.final?g.awayScore+' – '+g.homeScore:'Not final'}</span><span className="nfl-week-pick">{p?<><small>MODEL PICK</small><b>{p.pick}</b></>:<small>No model pick</small>}</span><span className="nfl-week-confidence"><small>CONFIDENCE</small><b>{confidence?confidence+' · relative edge '+Math.abs(p!.edge).toFixed(3):'Insufficient history'}</b></span><span className="nfl-week-outcome">{p?.correct===true?'✓ Correct':p?.correct===false?'✗ Incorrect':g.final?'Unrated':'Upcoming / Pending'}</span></div>})}</div>
 {!busy&&!rows.length&&<p className="notice">No games returned for this week. Historical schedule coverage may be incomplete.</p>}<p className="note">Confidence is a relative model-edge tier, not a calibrated probability. Basketball weeks are seven-day intervals from the first available game; football uses ESPN week numbers where available.</p></section>
}
