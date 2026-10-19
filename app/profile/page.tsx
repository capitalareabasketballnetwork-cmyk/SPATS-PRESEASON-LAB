'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {db} from '../../lib/supabase';
import type {User} from '@supabase/supabase-js';
type Model={name:string;weights:Record<string,number>;start:number;end:number;source?:string};
export default function ProfilePage(){
 const router=useRouter();
 const [user,setUser]=useState<User|null>(null),[models,setModels]=useState<Model[]>([]),[loading,setLoading]=useState(true);
 const [first,setFirst]=useState(''),[last,setLast]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;(async()=>{if(!db){setMessage('Account storage is not configured.');setLoading(false);return}
 const {data:{user:u}}=await db.auth.getUser();if(!active)return;setUser(u);setFirst(String(u?.user_metadata?.first_name||''));setLast(String(u?.user_metadata?.last_name||''));
 if(u){const {data,error}=await db.from('football_saved_models').select('name,model_data').eq('user_id',u.id).order('updated_at',{ascending:false});
 if(active){if(error)setMessage('Saved models could not be loaded: '+error.message);else setModels((data||[]).map(row=>({...row.model_data as Model,name:row.name})));}}
 if(active)setLoading(false)})();return()=>{active=false}},[]);
 const saveProfile=async()=>{if(!db||!first.trim()||!last.trim()){setMessage('First and last name are required.');return}setBusy(true);setMessage('');
 const {data,error}=await db.auth.updateUser({data:{first_name:first.trim(),last_name:last.trim(),full_name:first.trim()+' '+last.trim()}});
 if(error)setMessage(error.message);else{setUser(data.user);setMessage('Profile updated successfully.')}setBusy(false)};
 const logout=async()=>{if(!db)return;setBusy(true);const {error}=await db.auth.signOut();if(error){setMessage(error.message);setBusy(false)}else router.replace('/home')};
 return <main className="nfl-lab spats-profile-page"><div className="eyebrow">SPATS · MY ACCOUNT</div><h1>My Profile</h1><p className="note">Manage your account details and review models saved privately to your SPATS account.</p>
 {loading?<section className="panel"><p>Loading your profile…</p></section>:!user?<section className="panel"><p>Sign in to view your profile.</p></section>:<>
 <section className="panel"><h2>Personal information</h2><div className="spats-profile-grid"><label>First name<input autoComplete="given-name" maxLength={80} value={first} onChange={e=>setFirst(e.target.value)}/></label><label>Last name<input autoComplete="family-name" maxLength={80} value={last} onChange={e=>setLast(e.target.value)}/></label><label>Email address<input readOnly value={user.email||''}/></label><label>Account created<input readOnly value={user.created_at?new Date(user.created_at).toLocaleDateString(): '—'}/></label></div><div className="nfl-actions"><button className="primary" disabled={busy||!first.trim()||!last.trim()} onClick={()=>void saveProfile()}>{busy?'Saving…':'Save profile changes'}</button></div>{message&&<p className="note" role="status">{message}</p>}<p className="note">Your name is stored with your account and can be used for personalized features and authorized administration.</p></section>
 <section className="panel"><h2>My saved football models <span className="spats-profile-count">{models.length}</span></h2>{models.length?models.map(m=><div className="nfl-saved" key={m.name}><div><strong>{m.source==='ai-advisor'&&<span className="nfl-ai-star" title="AI-discovered model">✦ </span>}{m.name}</strong><small>{m.start}–{m.end} · {Object.keys(m.weights||{}).length} stats{m.source==='ai-advisor'?' · AI-discovered':''}</small></div><Link className="spats-profile-model-link" href="/football">Open in Model Lab →</Link></div>):<p className="note">No saved football models yet. <Link href="/football">Create your first model</Link>.</p>}</section>
 <section className="panel spats-profile-logout"><h2>Account access</h2><p className="note">You can sign out of your SPATS account on this device.</p><button className="secondary" disabled={busy} onClick={()=>void logout()}>Log out</button></section>
 </>}</main>;
}
