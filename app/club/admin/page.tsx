'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db} from '../../../lib/supabase';
type League={id:string;name:string;invite_code:string;owner_id:string};
export default function ClubAdmin(){
 const [status,setStatus]=useState<'checking'|'denied'|'allowed'>('checking');
 const [leagues,setLeagues]=useState<League[]>([]);
 const [selected,setSelected]=useState('');
 const [showCode,setShowCode]=useState(false);
 const [error,setError]=useState('');
 const [clubName,setClubName]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;(async()=>{
  if(!db){if(live){setStatus('denied');setError('Authentication is not configured.')}return}
  const {data:{user},error:authError}=await db.auth.getUser();
  if(!live)return;
  if(authError||!user||user.email?.trim().toLowerCase()!=='leyton9@icloud.com'){setStatus('denied');return}
  const {data:allowed,error:permissionError}=await db.rpc('nfl_is_club_admin');
  if(!live)return;
  if(permissionError||allowed!==true){setStatus('denied');setError('This account has the correct email, but administrator permission has not been assigned in Supabase.');return}
  const {data,error:clubsError}=await db.from('nfl_clubs').select('id,name,invite_code,owner_id').order('name');
  if(!live)return;
  if(clubsError)setError(clubsError.message);
  setLeagues((data||[]) as League[]);
  setSelected(data?.[0]?.id||'');
  setStatus('allowed');
 })();return()=>{live=false}},[]);
 const create=async()=>{
  if(!db||busy||!clubName.trim()||!displayName.trim())return;
  setBusy(true);setError('');
  const {error}=await db.rpc('nfl_create_club',{p_name:clubName.trim(),p_display_name:displayName.trim()});
  if(error){setError(error.message);setBusy(false);return}
  window.location.reload();
 };
 const active=leagues.find(l=>l.id===selected);
 return <main className="club-dashboard club-admin-page"><div className="club-topline"><span>SPATS / CLUB / ADMIN</span><Link href="/club" className="club-small-link">← Back to CLUB</Link></div>
 {status==='checking'?<section className="club-panel club-admin-verification"><div className="club-label">ADMIN VERIFICATION</div><h1>Verifying your account…</h1><p>Checking your signed-in email and administrator permissions.</p></section>:
 status==='denied'?<section className="club-panel club-admin-verification"><div className="club-label">ADMIN VERIFICATION</div><h1>Access denied</h1><p>You are not the admin. Only the authorized SPATS administrator can access this dashboard.</p>{error&&<p className="club-muted">{error}</p>}<Link href="/club" className="club-action club-admin-back">Go Back →</Link></section>:
 <><section className="club-banner club-admin-hero"><div><div className="club-kicker">🔐 &nbsp; VERIFIED ADMINISTRATOR</div><h1>LEAGUE <span>CONTROL CENTER.</span></h1><p>Manage SPATS NFL leagues, create invitation codes, and share access with your members.</p></div><div className="club-banner-art"><div className="club-trophy">🏆</div></div></section><div className="club-content club-admin-content"><div className="club-main"><div className="club-section-head"><div><div className="club-label">LEAGUE MANAGEMENT</div><h2>Your leagues</h2></div></div><div className="club-panel"><label htmlFor="admin-league-select" className="club-label">SELECT LEAGUE</label><select id="admin-league-select" className="club-select" value={selected} onChange={e=>setSelected(e.target.value)}>{leagues.length===0&&<option value="">No leagues yet</option>}{leagues.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>{active?<div className="club-admin-league"><div><span className="club-label">ACTIVE LEAGUE</span><h2>{active.name}</h2><p className="club-muted">Private NFL model competition</p></div><button className="club-action" onClick={()=>setShowCode(true)}>View Code <span>↗</span></button></div>:<div className="club-empty"><b>No leagues created</b><p>Create your first league to generate a member passcode.</p></div>}</div></div><aside className="club-sidebar"><div className="club-panel"><div className="club-label">ADMIN TOOLS</div><h3>Create a league</h3><p>Only verified administrators can create new leagues.</p><label htmlFor="admin-new-league">LEAGUE NAME</label><input id="admin-new-league" value={clubName} placeholder="e.g. SPATS NFL Championship" onChange={e=>setClubName(e.target.value)}/><label htmlFor="admin-display">YOUR DISPLAY NAME</label><input id="admin-display" value={displayName} placeholder="Name on leaderboard" onChange={e=>setDisplayName(e.target.value)}/><button className="club-action club-submit" disabled={busy||!clubName.trim()||!displayName.trim()} onClick={()=>void create()}>{busy?'Creating…':'Create League →'}</button>{error&&<p className="club-notice" role="alert">{error}</p>}</div></aside></div></>}
 {status==='allowed'&&showCode&&active&&<div className="club-code-overlay" role="presentation" onClick={()=>setShowCode(false)}><div className="club-code-modal" role="dialog" aria-modal="true" aria-labelledby="club-code-title" onClick={e=>e.stopPropagation()}><button className="club-code-close" aria-label="Close" onClick={()=>setShowCode(false)}>✕</button><div className="club-label">SPATS LEAGUE ACCESS</div><h2 id="club-code-title">{active.name}</h2><p>Share this code with members so they can join the competition.</p><div className="club-code-large">{active.invite_code}</div><button className="club-action" onClick={()=>void navigator.clipboard.writeText(active.invite_code)}>Copy Code</button></div></div>}
 </main>
}
