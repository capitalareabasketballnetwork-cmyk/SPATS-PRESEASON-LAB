'use client';
import {useEffect,useState} from 'react';
import {db} from '../../../lib/supabase';
import Link from 'next/link';
type Period={wins:number;games:number;accuracy:number};
type Model={name:string;weights:Record<string,number>;train:Period;validation:Period;holdout:Period};
type Result={models:Model[];evaluated:number;statsConsidered:number;method:string;cachedAt?:string};
const grade=(accuracy:number)=>accuracy>=60?'strong':accuracy>=55?'moderate':'weak';
const label=(name:string)=>name.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
export default function ModelAdvisor(){
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(0);
 const [saveName,setSaveName]=useState(''),[saving,setSaving]=useState(false),[saveMessage,setSaveMessage]=useState(''),[saveError,setSaveError]=useState(false);
 useEffect(()=>{void run()},[]);
 const run=async()=>{setBusy(true);setError('');setResult(null);setSelected(0);setSaveName('');setSaveMessage('');try{
 const response=await fetch('/api/football/model-advisor',{method:'POST'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Model optimization unavailable');
 if(!data.models?.length)throw Error('No eligible model combinations were found.');
 setResult(data);
 }catch(e){setError(String(e))}finally{setBusy(false)}};
 const best=result?.models[selected];
 const saveDiscovered=async()=>{const name=saveName.trim();if(!best||!name){setSaveMessage('Enter a name for your model.');setSaveError(true);return}if(name.length>80){setSaveMessage('Keep the model name under 80 characters.');setSaveError(true);return}if(!db){setSaveMessage('Account storage is not configured.');setSaveError(true);return}
 setSaving(true);setSaveMessage('');try{
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)throw Error('Sign in on the Football Model Lab page before saving an AI-discovered model.');
 const {data:existing,error:checkError}=await db.from('football_saved_models').select('name').eq('user_id',user.id).eq('name',name).maybeSingle();
 if(checkError)throw Error(checkError.message);if(existing)throw Error('A model with this name already exists. Choose a different name to avoid overwriting it.');
 const model={name,weights:{...best.weights},start:2015,end:2026,source:'ai-advisor',advisorOriginalName:best.name};
 const {error:insertError}=await db.from('football_saved_models').insert({user_id:user.id,name,model_data:model,updated_at:new Date().toISOString()});
 if(insertError)throw Error(insertError.message);
 setSaveMessage('✦ '+name+' saved to your account. It will appear with an AI star in Saved Models.');setSaveError(false);
 }catch(e){setSaveMessage(e instanceof Error?e.message:String(e));setSaveError(true)}finally{setSaving(false)}
 };

 return <main className="nfl-scorelab"><div className="nfl-scorelab-top"><Link href="/football">← Football Model Lab</Link><span>SPATS · MODEL OPTIMIZER</span></div>
 <h1>AI Model Advisor</h1><p>Discover new NFL models automatically. The optimizer searches combinations of the available statistics and weights, without using any saved user models.</p>
 <section className="panel"><h2>Find the strongest models</h2><p className="note">The search trains on 2018–2022, ranks candidates on 2023–2024, and reports 2025 as an unseen holdout season. The highest historical accuracy does not guarantee future wins.</p>
 <button className="nfl-ai-search-button" disabled={busy} onClick={()=>void run()}>{busy?'✦ Loading top models…':'✦ Find Top 5 Models'} <span aria-hidden="true">→</span></button>
 {busy&&<p className="note">Testing candidate statistics and weights. This may take a little while.</p>}{error&&<p className="notice">{error}</p>}
 </section>
 {result&&<><section className="panel"><h2>Top 5 discovered models</h2><p className="note">Evaluated {result.evaluated.toLocaleString()} combinations across {result.statsConsidered} candidate statistics. Ranked by validation accuracy—not by holdout accuracy.</p>
 <div className="nfl-advisor-top-five">{result.models.map((m,i)=><button key={m.name} className={selected===i?'active':''} onClick={()=>{setSelected(i);setSaveMessage('');setSaveName('')}}><small>#{i+1} · {m.name}</small><strong>{m.validation.accuracy.toFixed(2)}%</strong><span>2023–24 validation</span><small>2025 holdout: {m.holdout.accuracy.toFixed(2)}%</small></button>)}</div>
 {best&&<><h3>{best.name} · Weight breakdown</h3><div className={'nfl-score nfl-quality-'+grade(best.validation.accuracy)}><small>VALIDATION ACCURACY · 2023–2024</small><strong>{best.validation.accuracy.toFixed(2)}%</strong><b>{best.validation.wins} correct of {best.validation.games} graded games</b></div>
 <div className="nfl-advisor-periods"><div><small>TRAINING · 2018–2022</small><strong>{best.train.accuracy.toFixed(2)}%</strong><span>{best.train.wins}/{best.train.games} correct</span></div><div><small>VALIDATION · 2023–2024</small><strong>{best.validation.accuracy.toFixed(2)}%</strong><span>{best.validation.wins}/{best.validation.games} correct</span></div><div><small>HOLDOUT · 2025</small><strong>{best.holdout.accuracy.toFixed(2)}%</strong><span>{best.holdout.wins}/{best.holdout.games} correct</span></div></div>
 <div className="nfl-advisor-weights">{Object.entries(best.weights).filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]).map(([key,weight])=><div key={key}><span>{label(key)}</span><strong>{(weight*100).toFixed(1)}%</strong><div className="nfl-advisor-track"><i style={{width:Math.min(100,weight*100)+'%'}}/></div></div>)}</div>
 <div className="nfl-advisor-save"><label htmlFor="advisor-model-name">Name this AI-discovered model</label><div className="nfl-advisor-save-row"><input id="advisor-model-name" maxLength={80} value={saveName} onChange={e=>{setSaveName(e.target.value);setSaveMessage('')}} placeholder="Enter your own model name"/><button className="primary" disabled={!saveName.trim()||saving} onClick={()=>void saveDiscovered()}>{saving?'Saving…':'✦ Save AI Model'}</button></div><p className="note">Saved privately to your SPATS account. A four-point star identifies models created with the Model Advisor.</p>{saveMessage&&<p className={saveError?'notice':'nfl-advisor-save-success'} role="status">{saveMessage}</p>}</div></>}
 </section><section className="panel"><h2>Comparison table</h2><div className="nfl-table"><table><thead><tr><th>Model</th><th>Training</th><th>Validation</th><th>2025 Holdout</th><th>Active Stats</th></tr></thead><tbody>{result.models.map((m,i)=><tr key={m.name}><td><button className="secondary" onClick={()=>{setSelected(i);setSaveName('');setSaveMessage('')}}>{m.name}</button></td><td>{m.train.accuracy.toFixed(2)}%</td><td>{m.validation.accuracy.toFixed(2)}%</td><td>{m.holdout.accuracy.toFixed(2)}%</td><td>{Object.keys(m.weights).length}</td></tr>)}</tbody></table></div><p className="note">{result.method} This is a heuristic search rather than an exhaustive mathematical proof of the best possible weights. More backtesting is needed before live use.</p></section></>}
 </main>;
}
