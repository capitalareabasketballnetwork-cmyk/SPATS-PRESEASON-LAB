'use client';
import {useEffect,useState} from 'react';
type Game={id:string;date:string;status:string;state:string;home:string;away:string;homeScore:string|null;awayScore:string|null;homeLogo:string|null;awayLogo:string|null};
export default function CbbLive(){
 const [games,setGames]=useState<Game[]>([]),[error,setError]=useState(''),[updated,setUpdated]=useState(''),[busy,setBusy]=useState(true),[onlyLive,setOnlyLive]=useState(false);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await fetch('/api/cbb-live',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Feed unavailable');if(active){setGames(d.games||[]);setUpdated(d.updatedAt);setError('')}}catch(e){if(active)setError(String(e))}finally{if(active)setBusy(false)}};void refresh();const timer=setInterval(()=>void refresh(),60000);return()=>{active=false;clearInterval(timer)}},[]);
 const live=games.filter(g=>g.state==='in');const shown=onlyLive?live:games;
 return <section className="panel" style={{marginBottom:20}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
   <div><div className="eyebrow">🏀 SPATS GAME CENTER</div><h2>Division I Scoreboard</h2><p className="note">Today’s games · automatically refreshes every 60 seconds · ESPN public scoreboard</p></div>
   <div style={{display:'flex',gap:8,alignItems:'center'}}><button type="button" className={!onlyLive?'primary':'secondary'} onClick={()=>setOnlyLive(false)}>All games ({games.length})</button><button type="button" className={onlyLive?'primary':'secondary'} onClick={()=>setOnlyLive(true)}>🔴 Live ({live.length})</button></div>
  </div>
  {error&&<p className="notice" role="alert">Live feed unavailable: {error}. Historical model tools remain available.</p>}
  {busy&&<p>Loading today's games…</p>}
  {!busy&&!error&&!shown.length&&<p className="note">{onlyLive?'No games in progress right now.':'No Division I games scheduled today.'}</p>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,270px),1fr))',gap:12,marginTop:12}}>
   {shown.slice(0,120).map(g=><div key={g.id} style={{border:'1px solid var(--line, #384457)',borderRadius:12,padding:14,background:'var(--surface,transparent)'}}>
    <div style={{fontSize:12,opacity:.7,marginBottom:10}}>{g.state==='in'?'🔴 ':''}{g.status}</div>
    {([{team:g.away,score:g.awayScore,logo:g.awayLogo},{team:g.home,score:g.homeScore,logo:g.homeLogo}]).map((t,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:9,marginBottom:8}}>
     {t.logo?<img src={t.logo} alt="" width={25} height={25} style={{objectFit:'contain'}}/>:<span>🏀</span>}<span style={{flex:1,fontWeight:600,fontSize:13}}>{t.team}</span><strong>{t.score??'–'}</strong>
    </div>)}
   </div>)}
  </div>
  {updated&&<p className="note">Feed last checked: {new Date(updated).toLocaleTimeString()} · Data may be delayed and is not an official live betting feed.</p>}
 </section>
}