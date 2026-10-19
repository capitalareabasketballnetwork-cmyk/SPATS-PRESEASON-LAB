'use client';
import {useEffect,useState} from 'react';
import {db} from '../lib/supabase';
import SportsNav from './sports-nav';
import type {User} from '@supabase/supabase-js';

export default function SiteGate({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<User|null>(null);
 const [checking,setChecking]=useState(true);
 const [mode,setMode]=useState<'login'|'signup'>('login');
 const [email,setEmail]=useState('');
 const [firstName,setFirstName]=useState('');
 const [lastName,setLastName]=useState('');
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{if(!db){setChecking(false);return}let alive=true;db.auth.getUser().then(({data})=>{if(alive){setUser(data.user);setChecking(false)}}).catch(()=>{if(alive)setChecking(false)});const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{if(alive){setUser(session?.user||null);setChecking(false)}});return()=>{alive=false;subscription.unsubscribe()}},[]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!db){setMessage('Account authentication is not configured. Contact the site administrator.');return}if(mode==='signup'&&(!firstName.trim()||!lastName.trim())){setMessage('Enter your first and last name.');return}setBusy(true);setMessage('');try{const result=mode==='signup'?await db.auth.signUp({email:email.trim(),password,options:{data:{first_name:firstName.trim(),last_name:lastName.trim(),full_name:firstName.trim()+' '+lastName.trim()}}}):await db.auth.signInWithPassword({email:email.trim(),password});if(result.error)setMessage(result.error.message);else if(mode==='signup'&&!result.data.session)setMessage('Check your email to confirm your account, then sign in.');else setMessage('Signed in successfully.')}catch(e){setMessage(e instanceof Error?e.message:'Unable to sign in.')}finally{setBusy(false)}};
 if(checking)return <div className="spats-auth-loading" role="status">Checking your SPATS account…</div>;
 if(!user)return <main className="spats-auth-screen"><section className="spats-auth-card"><div className="spats-auth-mark">SPATS</div><div className="eyebrow">SPORTS ANALYTICS AT WESTERN MICHIGAN UNIVERSITY</div><h1>Welcome to SPATS</h1><p>Sign in or create an account to access our basketball rankings, football models and club analytics.</p><div className="spats-auth-switch"><button type="button" className={mode==='login'?'active':''} onClick={()=>{setMode('login');setMessage('')}}>Sign in</button><button type="button" className={mode==='signup'?'active':''} onClick={()=>{setMode('signup');setMessage('')}}>Create account</button></div><form onSubmit={submit}>{mode==='signup'&&<div className="spats-signup-names"><label>First name<input type="text" autoComplete="given-name" maxLength={80} required value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="First name"/></label><label>Last name<input type="text" autoComplete="family-name" maxLength={80} required value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Last name"/></label></div>}<label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" autoComplete={mode==='signup'?'new-password':'current-password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='signup'?'Create a password':'Your password'}/></label><button type="submit" className="primary" disabled={busy||!db}>{busy?'Please wait…':mode==='login'?'Sign in to SPATS':'Create SPATS account'}</button></form>{message&&<p className="spats-auth-message" role="status">{message}</p>}{!db&&<p className="spats-auth-message">Account authentication is not configured yet. The administrator must configure Supabase.</p>}<small>Accounts use Supabase Authentication. Email confirmation may be required.</small></section></main>;
 return <><SportsNav/>{children}</>;
}
