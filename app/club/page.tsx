'use client';
import {useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {db} from '../../lib/supabase';

type SavedModel={name:string;model_data:{weights?:Record<string,number>;start?:number;end?:number}};
type Club={id:string;name:string;invite_code:string};
type Submission={id:string;name:string;model_snapshot:Record<string,unknown>;active_from:string};
export default function ClubPage(){
 const requestedClub=useSearchParams().get('league');
 const [models,setModels]=useState<SavedModel[]>([]);
 const [clubs,setClubs]=useState<Club[]>([]);
 const [selectedClub,setSelectedClub]=useState('');
 const [selectedModel,setSelectedModel]=useState('');
 const [submission,setSubmission]=useState<Submission|null>(null);
 const [message,setMessage]=useState('');
 const [clubName,setClubName]=useState('');
 const [inviteCode,setInviteCode]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [busy,setBusy]=useState(false);
 const [showJoin,setShowJoin]=useState(false);
 const [previewBusy,setPreviewBusy]=useState(false);
 const [previewError,setPreviewError]=useState('');
 const [previewPicks,setPreviewPicks]=useState<{game_id:string;week:number;date:string;home:string;away:string;pick:string|null;confidence:number|null;final:boolean}[]>([]);
 const [overrides,setOverrides]=useState<Record<string,string>>({});
 const [savedWeek,setSavedWeek]=useState<number|null>(null);
 const [weekLock,setWeekLock]=useState<string|null>(null);
 const [userId,setUserId]=useState('');
 const [isAdmin,setIsAdmin]=useState(false);
 const [standings,setStandings]=useState<{name:string;wins:number;graded:number;accuracy:number}[]>([]);
 const [loading,setLoading]=useState(true);
 const [weeklyPicks,setWeeklyPicks]=useState<{game_id:string;predicted_winner:string;confidence:number|null;result:string|null;user_id:string;nfl_club_games:{week:number;home_team:string;away_team:string;kickoff_at:string}|null}[]>([]);
 const [memberNames,setMemberNames]=useState<Record<string,string>>({});
 useEffect(()=>{let active=true;async function load(){
  if(!db){setMessage('Supabase is not configured.');setLoading(false);return}
  const {data:{user}}=await db.auth.getUser();
  if(!user){setMessage('Sign in to view your saved NFL models.');setLoading(false);return}
  setUserId(user.id);
  const [saved,membership,adminStatus]=await Promise.all([
   db.from('football_saved_models').select('name,model_data').eq('user_id',user.id).order('updated_at',{ascending:false}),
   db.from('nfl_club_members').select('club_id,nfl_clubs(id,name,invite_code)').eq('user_id',user.id),
   db.rpc('nfl_is_club_admin')
  ]);
  if(!active)return;
  setIsAdmin(adminStatus.data===true);
  if(saved.error)setMessage('Unable to load saved NFL models: '+saved.error.message);
  else setModels((saved.data||[]).filter(row=>!row.name.match(/^(CFB|CBB|NBA)::/i)&&!['college-football','college-basketball','nba','cfb','cbb'].includes(String(row.model_data?.league||'').toLowerCase())) as SavedModel[]);
  if(membership.error)setMessage(v=>v||'Club database is not yet configured: '+membership.error.message);
  else{
   const found=(membership.data||[]).flatMap(row=>{const raw=row.nfl_clubs;return raw?(Array.isArray(raw)?raw:[raw]):[]}) as Club[];
   setClubs(found);if(found.length)setSelectedClub(found.find(c=>c.id===requestedClub)?.id||found[0].id);
  }
  setLoading(false);
 }void load();return()=>{active=false}},[requestedClub]);
 useEffect(()=>{let active=true;async function load(){
  if(!db||!selectedClub){setSubmission(null);return}
  const {data:{user}}=await db.auth.getUser();if(!user)return;
  const {data}=await db.from('nfl_club_models').select('id,name,model_snapshot,active_from').eq('club_id',selectedClub).eq('user_id',user.id).is('retired_at',null).maybeSingle();
  if(active){setSubmission((data||null) as Submission|null);if(data?.name)setSelectedModel(data.name)}
 }void load();return()=>{active=false}},[selectedClub]);
 const reload=()=>window.location.reload();
 const createOrJoin=async(kind:'create'|'join')=>{
  if(!db||busy)return;setBusy(true);setMessage('');
  try{
   const fn=kind==='create'?'nfl_create_club':'nfl_join_club';
   const args=kind==='create'?{p_name:clubName.trim(),p_display_name:displayName.trim()}:{p_code:inviteCode.trim().toUpperCase(),p_display_name:displayName.trim()};
   const {error}=await db.rpc(fn,args);
   if(error)throw error;reload();
  }catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false)}
 };
 const review=async(modelName?:string)=>{
  const model=models.find(m=>m.name===(modelName||selectedModel));
  if(!model||!selectedClub)return;setPreviewBusy(true);setPreviewError('');setPreviewPicks([]);setOverrides({});setSavedWeek(null);setWeekLock(null);
  try{
   if(!db)throw Error('Supabase unavailable');
   const response=await fetch('/api/football',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({weights:model.model_data.weights,start:2026,end:2026})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Could not generate NFL predictions');
   const {data:{session}}=await db.auth.getSession();
   if(!session)throw Error('Sign in again to synchronize the league schedule.');
   const syncResponse=await fetch('/api/club/schedule',{method:'POST',headers:{authorization:'Bearer '+session.access_token}});
   const syncData=await syncResponse.json();
   if(!syncResponse.ok)throw Error('NFL schedule sync failed: '+(syncData.error||syncResponse.status));
   const {data:schedule,error:scheduleError}=await db.from('nfl_club_games').select('game_id,week,kickoff_at,home_team,away_team').eq('season',2026).order('kickoff_at');
   if(scheduleError)throw scheduleError;
   const groups=new Map<number,typeof schedule>();for(const g of schedule||[]){groups.set(g.week,[...(groups.get(g.week)||[]),g])}
   const next=Array.from(groups.entries()).sort((a,b)=>a[0]-b[0]).find(([,games])=>games.length&&new Date(games[0].kickoff_at).getTime()>Date.now());
   if(!next)throw Error('No unlocked upcoming NFL week found. The league schedule may need to sync.');
   const [week,games]=next;const predictions=new Map<string,any>((data.games||[]).map((g:any)=>[String(g.game_id),g]));
   const {data:existing,error:existingError}=await db.from('nfl_club_picks').select('game_id,predicted_winner').eq('club_id',selectedClub).eq('user_id',userId).in('game_id',games.map(g=>g.game_id));
   if(existingError)throw existingError;
   const existingMap=new Map((existing||[]).map(p=>[p.game_id,p.predicted_winner]));
   const items=games.map(g=>{const p=predictions.get(g.game_id);return {game_id:g.game_id,week,date:g.kickoff_at,home:g.home_team,away:g.away_team,pick:(p?.pick===g.home_team||p?.pick===g.away_team)?p.pick:null,confidence:typeof p?.confidence==='number'?p.confidence:null,final:false}});
   setPreviewPicks(items);
   setWeekLock(games[0].kickoff_at);
   setOverrides(Object.fromEntries(items.map(p=>[p.game_id,existingMap.get(p.game_id)||p.pick||''])));
   if(items.some(p=>!p.pick))setPreviewError('Some games have no model projection. Select a team manually for each game before submitting.');
  }catch(e){setPreviewError(e instanceof Error?e.message:String(e))}finally{setPreviewBusy(false)}
 };
 const savePicks=async()=>{
  if(!db||!selectedClub||!submission||!previewPicks.length||busy)return;
  if(weekLock&&Date.now()>=new Date(weekLock).getTime()){setPreviewError('This week is locked because its first game has started.');return}
  if(previewPicks.some(p=>![p.home,p.away].includes(overrides[p.game_id]||''))){setPreviewError('Select a winner for every game before submitting.');return}
  setBusy(true);setPreviewError('');
  const {error}=await db.rpc('nfl_submit_week_picks',{p_club_id:selectedClub,p_model_id:submission.id,p_week:previewPicks[0].week,p_picks:previewPicks.map(p=>({game_id:p.game_id,pick:overrides[p.game_id],confidence:p.confidence}))});
  setBusy(false);
  if(error){setPreviewError(error.message);return}
  setSavedWeek(previewPicks[0].week);
  setMessage('Week '+previewPicks[0].week+' picks saved. You can edit them until the first kickoff.');
  window.location.reload();
 };
 const submit=async()=>{
  if(!db||busy||!selectedClub||!selectedModel)return;setBusy(true);setMessage('');
  try{
   const {error}=await db.rpc('nfl_submit_model',{p_club_id:selectedClub,p_source_model_name:selectedModel});
   if(error)throw error;setSubmission(null);reload();
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 useEffect(()=>{let alive=true;async function load(){
  if(!db||!selectedClub){setStandings([]);return}
  const [members,picks]=await Promise.all([
   db.from('nfl_club_members').select('user_id,display_name').eq('club_id',selectedClub),
   db.from('nfl_club_picks').select('user_id,result').eq('club_id',selectedClub).in('result',['win','loss'])
  ]);
  if(!alive)return;
  if(members.error||picks.error){setMessage(members.error?.message||picks.error?.message||'Unable to load standings');return}
  const rows=(members.data||[]).map(m=>{
   const graded=(picks.data||[]).filter(p=>p.user_id===m.user_id);
   const wins=graded.filter(p=>p.result==='win').length;
   return {name:m.display_name,wins,graded:graded.length,accuracy:graded.length?wins/graded.length:0}
  });
  rows.sort((a,b)=>b.accuracy-a.accuracy||b.wins-a.wins||a.name.localeCompare(b.name));
  setStandings(rows);
  setMemberNames(Object.fromEntries((members.data||[]).map(m=>[m.user_id,m.display_name])));
  const {data:allPicks,error:pickError}=await db.from('nfl_club_picks').select('game_id,user_id,predicted_winner,confidence,result,nfl_club_games(week,home_team,away_team,kickoff_at)').eq('club_id',selectedClub).order('generated_at',{ascending:false}).limit(100);
  if(!alive)return;
  if(pickError)setMessage(pickError.message);
  else setWeeklyPicks((allPicks||[]) as unknown as typeof weeklyPicks);
 }void load();return()=>{alive=false}},[selectedClub]);
 const chosen=models.find(m=>m.name===selectedModel);
 const [tab,setTab]=useState<'overview'|'matchups'|'standings'|'models'>('overview');
 const activeClub=clubs.find(c=>c.id===selectedClub);
 const weeks=Array.from(new Set(weeklyPicks.map(p=>p.nfl_club_games?.week).filter((n):n is number=>typeof n==='number'))).sort((a,b)=>b-a);
 const [weekFilter,setWeekFilter]=useState<number|null>(null);
 const displayWeek=weekFilter??weeks[0]??null;
 const filteredPicks=weeklyPicks.filter(p=>displayWeek===null||p.nfl_club_games?.week===displayWeek);
 const gameGroups=Array.from(new Map(filteredPicks.map(p=>[p.game_id,p.nfl_club_games])).entries());
 if(!loading&&!clubs.length)return <main className="club-dashboard club-gate club-gate-full"><div className="club-topline"><span>SPATS / COMPETITIONS / NFL</span><span className="club-season">2026 NFL SEASON <span className="club-live-dot"/></span></div><section className="club-banner club-landing-banner"><div><div className="club-kicker">🏆 &nbsp; THE SPATS LEAGUE</div><h1>COMPETE WITH <span>YOUR MODEL.</span></h1><p>Build your edge. Submit your NFL model. Take on the club every week and climb the standings. The best prediction accuracy wins.</p>{!showJoin?<div className="club-hero-actions"><button className="club-action" onClick={()=>setShowJoin(true)}>Join League →</button></div>:<div className="club-landing-join"><div className="club-label">ENTER YOUR LEAGUE PASSCODE</div><div className="club-landing-inputs"><input aria-label="Display name" placeholder="Your display name" value={displayName} onChange={e=>setDisplayName(e.target.value)}/><input aria-label="League passcode" placeholder="League passcode" value={inviteCode} onChange={e=>setInviteCode(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==='Enter'&&displayName.trim()&&inviteCode.trim())void createOrJoin('join')}}/></div><button className="club-action" disabled={busy||!displayName.trim()||!inviteCode.trim()} onClick={()=>void createOrJoin('join')}>{busy?'Joining...':'Enter League →'}</button><button className="club-action-outline" onClick={()=>setShowJoin(false)}>Cancel</button>{message&&<div className="club-notice" role="status">{message}</div>}</div>}</div><div className="club-banner-art"><div className="club-trophy">🏆</div><div className="club-art-caption">SPATS <b>LEAGUE</b><small>EST. 2026 · WESTERN MICHIGAN</small></div></div></section><Link href="/club/admin" className="club-admin-corner">⚙ Admin</Link></main>;
 return <main className="club-dashboard">
  <div className="club-topline"><span>SPATS / COMPETITIONS / NFL</span><span className="club-season">2026 NFL SEASON <span className="club-live-dot"/></span></div>
  <section className="club-banner"><div><div className="club-kicker">🏆 &nbsp; THE SPATS LEAGUE</div><h1>COMPETE WITH <span>YOUR MODEL.</span></h1><p>Build your edge. Submit your NFL model. Take on the club every week and climb the standings. The best prediction accuracy wins.</p><div className="club-hero-actions"><button className="club-action" onClick={()=>setTab('models')}>Manage my model <span>↗</span></button><button className="club-action-outline" onClick={()=>setTab('standings')}>View leaderboard →</button></div></div><div className="club-banner-art"><div className="club-trophy">🏆</div><div className="club-art-caption">SPATS <b>LEAGUE</b><small>EST. 2026 · WESTERN MICHIGAN</small></div></div></section>
  <div className="club-tabs">{([['overview','◈ Overview'],['matchups','▦ Weekly picks'],['standings','♛ Leaderboard'],['models','⚙ My models']] as const).map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
  <div className="club-content">
   <div className="club-main">
    {tab==='overview'&&<div className="club-panel club-model-panel"><div className="club-label">YOUR PICKS · UPCOMING NFL WEEK</div><h2>Make your picks</h2><p className="club-muted">Choose an NFL model, review each matchup and edit any prediction. All picks lock at the first kickoff of the week.</p>{models.length===0?<p>No saved NFL models yet. <Link className="club-small-link" href="/football">Go to the NFL Model Lab to create and save one →</Link></p>:<><label htmlFor="overview-model">SELECT YOUR NFL MODEL</label><select id="overview-model" className="club-select" value={selectedModel} onChange={e=>{setSelectedModel(e.target.value);setPreviewPicks([]);setOverrides({});setPreviewError('')}}><option value="">Choose an NFL model...</option>{models.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select><button className="club-action-outline club-review-btn" disabled={!selectedModel||previewBusy} onClick={()=>void review()}>{previewBusy?'Generating picks...':'Generate / Review This Week →'}</button>{submission?.name!==selectedModel&&selectedModel&&<p className="club-muted">Submit this model in My Models before saving official picks.</p>}</>}{previewPicks.length>0&&<div className="club-review"><div className="club-label">WEEK {previewPicks[0].week} · {weekLock?'LOCKS '+new Date(weekLock).toLocaleString():'LOCK TIME UNAVAILABLE'}</div>{previewPicks.map(p=><div className="club-review-row" key={p.game_id}><div><small>{new Date(p.date).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small><b>{p.away} @ {p.home}</b><small>Model: {p.pick||'No projection'} · {p.confidence==null?'No confidence':p.confidence+'% confidence'}</small></div><select className="club-select" aria-label={'Pick winner of '+p.away+' at '+p.home} disabled={!!weekLock&&Date.now()>=new Date(weekLock).getTime()} value={overrides[p.game_id]||''} onChange={e=>setOverrides(v=>({...v,[p.game_id]:e.target.value}))}><option value="">Choose winner</option><option value={p.away}>{p.away}</option><option value={p.home}>{p.home}</option></select></div>)}<button className="club-action club-submit" disabled={busy||!submission||submission.name!==selectedModel||!!weekLock&&Date.now()>=new Date(weekLock).getTime()} onClick={()=>void savePicks()}>{busy?'Saving...':'Submit / Update Week '+previewPicks[0].week+' Picks →'}</button>{savedWeek!==null&&<p className="club-muted">Week {savedWeek} saved successfully.</p>}</div>}{previewError&&<p role="alert" className="club-notice">{previewError}</p>}</div>}
    {tab==='standings'&&<><div className="club-section-head"><div><div className="club-label">THE RACE FOR FIRST</div><h2>Season leaderboard</h2></div><span className="club-muted">Ranked by prediction accuracy</span></div>
    <div className="club-panel club-leaderboard"><div className="club-table-head"><span>RANK / MEMBER</span><span>RECORD</span><span>ACCURACY</span></div>{standings.length?standings.map((m,i)=><div className="club-leader-row" key={i}><div className="club-person"><span className={'club-position '+(i===0?'first':'')}>{String(i+1).padStart(2,'0')}</span><span className="club-avatar">{m.name.slice(0,1).toUpperCase()}</span><div><b>{m.name}</b><small>{i===0&&m.graded?'Current leader':'Club competitor'}</small></div></div><span className="club-record">{m.wins}–{m.graded-m.wins}</span><span className="club-percentage">{m.graded?(m.accuracy*100).toFixed(1)+'%':'—'}</span></div>):<div className="club-empty"><span>♛</span><b>Your leaderboard starts here</b><p>Create or join a club to start competing. Rankings update after games finish.</p></div>}</div></>}
    {tab==='matchups'&&<><div className="club-section-head club-section-space"><div><div className="club-label">GAME DAY / MODEL PICKS</div><h2>Your weekly picks</h2></div>{weeks.length>0&&<select className="club-select club-week-select" value={displayWeek??''} onChange={e=>setWeekFilter(Number(e.target.value))}>{weeks.map(w=><option key={w} value={w}>Week {w}</option>)}</select>}</div>
    {gameGroups.length?<div className="club-matchups">{gameGroups.map(([id,g])=><div className="club-matchup" key={id}><div className="club-matchup-teams"><span className="club-game-tag">WEEK {g?.week} · {g?.kickoff_at?new Date(g.kickoff_at).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'TBD'}</span><h3>{g?.away_team} <span>@</span> {g?.home_team}</h3></div><div className="club-matchup-picks">{filteredPicks.filter(p=>p.game_id===id&&p.user_id===userId).map(p=><div key={p.user_id} className="club-pick"><span>{memberNames[p.user_id]||'Member'}</span><b>{p.predicted_winner}</b><small className={p.result==='win'?'club-win':p.result==='loss'?'club-loss':''}>{p.result|| (p.confidence!=null?p.confidence+'% confidence':'Pending')}</small></div>)}</div></div>)}</div>:<div className="club-panel club-empty"><span>🏈</span><b>Game-day predictions will appear here</b><p>Submit your upcoming week picks from Overview to see them here.</p></div>}</>}
    {tab==='models'&&<><div className="club-section-head"><div><div className="club-label">BUILD YOUR EDGE</div><h2>Model submission</h2></div><Link className="club-small-link" href="/football?tab=saved">NFL Model Lab ↗</Link></div><div className="club-panel club-model-panel"><div className="club-model-current"><div><span className="club-label">ACTIVE COMPETITION MODEL</span><h3>{submission?submission.name:'No model submitted yet'}</h3><p>{submission?'Your model is locked as a snapshot for generated picks. You can replace it for future games.':'Select a saved NFL model below to enter the competition.'}</p></div><span className={'club-status '+(submission?'active':'')}>{submission?'● ACTIVE':'NOT SUBMITTED'}</span></div><label htmlFor="club-model-select">CHOOSE A SAVED MODEL</label><select className="club-select" id="club-model-select" value={selectedModel} onChange={e=>{setSelectedModel(e.target.value);setPreviewPicks([]);setOverrides({});setPreviewError('')}}><option value="">Select your model...</option>{models.map(m=><option value={m.name} key={m.name}>{m.name}</option>)}</select>{chosen&&<div className="club-weights">{Object.entries(chosen.model_data?.weights||{}).filter(([,v])=>Number(v)>0).map(([key,v])=><div key={key}><span>{key.replaceAll('_',' ')}</span><div className="club-weight-track"><div style={{width:Math.min(100,Math.max(0,Number(v)*100))+'%'}}/></div><b>{(Number(v)*100).toFixed(1)}%</b></div>)}</div>}{chosen&&<><button className="club-action-outline club-review-btn" disabled={previewBusy} onClick={()=>void review()}>{previewBusy?'Calculating NFL picks...':'Review upcoming week picks →'}</button>{previewError&&<p role="status" className="club-muted">{previewError}</p>}{previewPicks.length>0&&<div className="club-review"><div className="club-label">WEEK {previewPicks[0].week} · PREGAME MODEL PROJECTIONS</div><p className="club-muted">Review the model's predictions and confidence. Manual choices are currently a draft preview and are not saved as official league picks.</p>{previewPicks.map(p=><div className="club-review-row" key={p.game_id}><div><small>{new Date(p.date).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small><b>{p.away} @ {p.home}</b><small>Model pick: {p.pick||'Unavailable'} · {p.confidence==null?'Confidence unavailable':p.confidence+'% confidence'}</small></div><select aria-label={'Draft pick for '+p.away+' at '+p.home} className="club-select" value={overrides[p.game_id]||p.pick||''} onChange={e=>setOverrides(v=>({...v,[p.game_id]:e.target.value}))}><option value="">No pick</option><option value={p.away}>{p.away}</option><option value={p.home}>{p.home}</option></select></div>)}</div>}</>}<button className="club-action club-submit" disabled={busy||!selectedClub||!selectedModel} onClick={()=>void submit()}>{busy?'Submitting...':'Submit model to competition →'}</button>{!models.length&&<p className="club-muted">No saved models yet. Build and save one in the NFL Model Lab first.</p>}</div></>}
   </div>
   <aside className="club-sidebar"><div className="club-panel club-club-card"><div className="club-label">YOUR COMPETITION</div><h3>{activeClub?.name||'Join the competition'}</h3><p>{activeClub?'Your NFL prediction club':'Create your own club or enter an invitation code to compete with friends.'}</p>{clubs.length>0&&<select className="club-select" aria-label="Select club" value={selectedClub} onChange={e=>{setSelectedClub(e.target.value);setWeekFilter(null)}}>{clubs.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select>}{activeClub&&<div className="club-invite"><small>INVITE CODE</small><strong>{activeClub.invite_code}</strong><button onClick={()=>void navigator.clipboard.writeText(activeClub.invite_code)}>Copy</button></div>}</div>
   <div className="club-panel club-my-entry"><div className="club-label">YOUR ENTRY</div><div className="club-entry-icon">⚙</div><h3>{submission?.name||'Ready to compete?'}</h3><p>{submission?'Model successfully submitted':'Pick a saved model to enter your club competition.'}</p><button onClick={()=>setTab('models')}>{submission?'View my model →':'Submit a model →'}</button></div>
   <div className="club-panel club-rules"><div className="club-label">THE RULEBOOK</div><h3>How it works</h3><div><span>01</span><p><b>One active model</b><small>Submit a saved NFL model.</small></p></div><div><span>02</span><p><b>Picks lock at kickoff</b><small>No editing after games start.</small></p></div><div><span>03</span><p><b>Accuracy wins</b><small>Highest graded win percentage takes the title.</small></p></div></div>
   </aside>
  </div>
  {message&&<div className="club-notice" role="status">{message}</div>}
  <Link href="/club/admin" className="club-admin-corner">Admin</Link>
  <div className="club-bottom">SPATS CLUB COMPETITION <span>SPORTS ANALYTICS AT WESTERN MICHIGAN UNIVERSITY</span></div>
 </main>;
}
