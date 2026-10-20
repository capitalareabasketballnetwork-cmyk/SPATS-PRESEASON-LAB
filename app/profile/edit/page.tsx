'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {db} from '../../../lib/supabase';
export default function EditProfile(){
 const router=useRouter();
 const [first,setFirst]=useState(''),[last,setLast]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{db?.auth.getUser().then(({data})=>{setFirst(data.user?.user_metadata?.first_name||'');setLast(data.user?.user_metadata?.last_name||'');setEmail(data.user?.email||'')})},[]);
 const save=async(e:React.FormEvent)=>{e.preventDefault();if(!db||!first.trim()||!last.trim())return;setBusy(true);setError('');
 const {error:err}=await db.auth.updateUser({data:{first_name:first.trim(),last_name:last.trim(),full_name:first.trim()+' '+last.trim()}});
 if(err)setError(err.message);else router.push('/profile');setBusy(false)};
 return <main className="nfl-lab spats-profile-page"><div className="eyebrow">SPATS · ACCOUNT</div><h1>Edit Profile</h1><section className="panel"><form onSubmit={save}><div className="spats-profile-grid"><label>First name<input required maxLength={80} autoComplete="given-name" value={first} onChange={e=>setFirst(e.target.value)}/></label><label>Last name<input required maxLength={80} autoComplete="family-name" value={last} onChange={e=>setLast(e.target.value)}/></label><label>Email address<input readOnly value={email}/></label></div>{error&&<p className="notice" role="alert">{error}</p>}<div className="nfl-actions"><button type="submit" className="primary" disabled={busy||!first.trim()||!last.trim()}>{busy?'Saving…':'Save Changes'}</button><Link className="spats-profile-model-link" href="/profile">Cancel</Link></div></form></section></main>
}
