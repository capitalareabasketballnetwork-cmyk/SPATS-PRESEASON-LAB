'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db} from '../../lib/supabase';

type SavedModel={name:string;model_data:{weights?:Record<string,number>;start?:number;end?:number}};
type Club={id:string;name:string;invite_code:string};
type Submission={id:string;name:string;model_snapshot:Record<string,unknown>;active_from:string};
export default function ClubPage(){
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
 const [loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;async function load(){
  if(!db){setMessage('Supabase is not configured.');setLoading(false);return}
  const {data:{user}}=await db.auth.getUser();
  if(!user){setMessage('Sign in to view your saved NFL models.');setLoading(false);return}
  const [saved,membership]=await Promise.all([
   db.from('football_saved_models').select('name,model_data').eq('user_id',user.id).order('updated_at',{ascending:false}),
   db.from('nfl_club_members').select('club_id,nfl_clubs(id,name,invite_code)').eq('user_id',user.id)
  ]);
  if(!active)return;
  if(saved.error)setMessage('Unable to load saved NFL models: '+saved.error.message);
  else setModels((saved.data||[]) as SavedModel[]);
  if(membership.error)setMessage(v=>v||'Club database is not yet configured: '+membership.error.message);
  else{
   const found=(membership.data||[]).flatMap(row=>{const raw=row.nfl_clubs;return raw?(Array.isArray(raw)?raw:[raw]):[]}) as Club[];
   setClubs(found);if(found.length)setSelectedClub(found[0].id);
  }
  setLoading(false);
 }void load();return()=>{active=false}},[]);
 useEffect(()=>{let active=true;async function load(){
  if(!db||!selectedClub){setSubmission(null);return}
  const {data:{user}}=await db.auth.getUser();if(!user)return;
  const {data}=await db.from('nfl_club_models').select('id,name,model_snapshot,active_from').eq('club_id',selectedClub).eq('user_id',user.id).is('retired_at',null).maybeSingle();
  if(active)setSubmission((data||null) as Submission|null);
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
 const submit=async()=>{
  if(!db||busy||!selectedClub||!selectedModel)return;setBusy(true);setMessage('');
  try{
   const {error}=await db.rpc('nfl_submit_model',{p_club_id:selectedClub,p_source_model_name:selectedModel});
   if(error)throw error;reload();
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const chosen=models.find(m=>m.name===selectedModel);
 return <main className="spats-home">
  <section className="hero"><div className="eyebrow">SPATS · NFL MODEL COMPETITION</div><h1>CLUB <em>Competition</em></h1><p>Submit an existing saved NFL model and compete on weekly predictions. One active model per member; accuracy determines the season champion.</p></section>
  <section className="spats-sport-cards">
   <article className="spats-sport-card"><div className="eyebrow">YOUR CLUB</div><h2>Club Membership</h2>
    {clubs.length?<><label htmlFor="club-choice">Select club</label><select id="club-choice" value={selectedClub} onChange={e=>setSelectedClub(e.target.value)}>{clubs.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></>:<p>You haven't joined an NFL competition club yet. Create a club or enter an invitation code below.</p>}
   </article>
   <article className="spats-sport-card"><div className="eyebrow">YOUR SUBMISSION</div><h2>{submission?submission.name:'No active model'}</h2><p>{submission?'Your submitted model is stored as a competition snapshot.':'Choose an existing saved NFL model below. Submission opens when the secure club service is enabled.'}</p></article>
   <article className="spats-sport-card"><div className="eyebrow">COMPETITION RULES</div><h2>Accuracy wins</h2><p>One active model per member. Picks are hidden from opponents until each game starts. Only live, pregame picks count.</p></article>
  </section>
  <section className="spats-sport-cards">
   <article className="spats-sport-card"><div className="eyebrow">NFL MODEL LAB</div><h2>Select a saved model</h2>
    {loading?<p>Loading your models…</p>:models.length?<><label htmlFor="model-choice">Saved NFL model</label><select id="model-choice" value={selectedModel} onChange={e=>setSelectedModel(e.target.value)}><option value="">Choose a model</option>{models.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select></>:<p>No saved NFL models found for your account.</p>}
    {chosen&&<><p><strong>Weights</strong></p><ul>{Object.entries(chosen.model_data?.weights||{}).filter(([,v])=>Number(v)>0).map(([key,value])=><li key={key}>{key.replaceAll('_',' ')}: {(Number(value)*100).toFixed(1)}%</li>)}</ul><p>Submitting replaces your active model for future unlocked games; previous model snapshots are retained.</p></>}
    <button disabled={busy||!selectedClub||!selectedModel} onClick={()=>void submit()}>Submit selected model to club</button><p>Only submit models before the relevant game cutoff. Automated game picks are not yet enabled.</p>
    <Link href="/football?tab=saved">Open NFL saved models →</Link>
   </article>
   <article className="spats-sport-card"><div className="eyebrow">WEEKLY PICKS</div><h2>Upcoming predictions</h2><p>Weekly picks, game-by-game outcomes and club consensus will appear here after the automated prediction service is connected.</p></article>
   <article className="spats-sport-card"><div className="eyebrow">SEASON STANDINGS</div><h2>Leaderboard</h2><p>Season rankings will be based on correct predictions divided by graded predictions. No fabricated results or historical backtests will be shown as live scores.</p></article>
  </section>
  {message&&<p role="status">{message}</p>}
 </main>;
}
