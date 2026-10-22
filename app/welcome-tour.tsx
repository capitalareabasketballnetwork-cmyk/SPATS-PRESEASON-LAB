'use client';
import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {useRouter,usePathname} from 'next/navigation';

const steps=[
 {title:'Welcome to SPATS',description:'Build your own sports prediction models, explore historical results, and learn how betting markets work. This quick tour will show you where to start.',target:'.spats-auth-mark'},
 {title:'Start with the Football Model Lab',description:'The NFL Model Lab is your starting point. Choose the statistics you believe are most predictive and set their importance.',target:'.nfl-tabs',href:'/football?tab=builder'},
 {title:'Build your first model',description:'In Model Builder, select statistics and adjust their weights. Then choose seasons to test your approach against historical games.',target:'.nfl-two-col',href:'/football?tab=builder'},
 {title:'Compute and check your results',description:'Click Compute Model to test your selections. Review accuracy and game-by-game predictions before deciding whether to save your model.',target:'.nfl-two-col',href:'/football?tab=builder'},
 {title:'Save your model',description:'Save models so you can reuse them in the Odds Calculator, Upcoming Games, and model comparisons. Look for the Saved Models tab.',target:'.nfl-tabs',href:'/football?tab=saved'},
 {title:'Explore historical betting results',description:'The Odds Calculator simulates moneyline, spread, and total bets using historical lines. Change seasons, hypothetical stake, and confidence to understand the results.',target:'.nfl-tabs',href:'/football?tab=odds'},
 {title:'Understand confidence',description:'Confidence helps you filter lower-rated predictions. A higher threshold means fewer picks, and the best historical threshold is not a guarantee of future profits.',target:'.nfl-confidence-filter',href:'/football?tab=odds'},
 {title:'Check upcoming games',description:'This Week’s Picks loads your saved model into Upcoming Games. Compare the model projections with current sportsbook lines; SPATS does not place bets.',target:'.nfl-upcoming-link',href:'/football?tab=odds'},
 {title:'You’re ready to explore!',description:'You can restart this tour anytime using the Take a Tour button. Remember: SPATS is an educational analytics tool, not a promise of winning bets.',target:'.nfl-tabs',href:'/football?tab=builder'}
];
export default function WelcomeTour({user}:{user:User}){
 const router=useRouter();const pathname=usePathname();
 const [step,setStep]=useState<number|null>(null);
 const [rect,setRect]=useState<{top:number;left:number;width:number;height:number}|null>(null);
 const key='spats-tour-v1-'+user.id;
 useEffect(()=>{if(!localStorage.getItem(key))setStep(0)},[key]);
 useEffect(()=>{
  if(step===null){setRect(null);return}
  const update=()=>{const el=document.querySelector(steps[step].target);if(!el){setRect(null);return}const r=el.getBoundingClientRect();setRect(r.width&&r.height?{top:r.top,left:r.left,width:r.width,height:r.height}:null)};
  update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true)}
 },[step,pathname]);
 const finish=()=>{localStorage.setItem(key,'done');setStep(null)};
 const next=()=>{if(step===null)return;if(step===steps.length-1)finish();else {const upcoming=steps[step+1];setStep(step+1);if(upcoming.href)router.push(upcoming.href)}};
 return <>
  <button className="spats-tour-restart" type="button" onClick={()=>setStep(0)}>ⓘ Take a Tour</button>
  {step!==null&&<div className="spats-tour-overlay" role="dialog" aria-modal="true" aria-label="SPATS welcome walkthrough">
   <div className="spats-tour-shade"/>
   {rect&&<div className="spats-tour-spotlight" style={{top:Math.max(0,rect.top-6),left:Math.max(0,rect.left-6),width:rect.width+12,height:rect.height+12}}/>}
   <section className="spats-tour-card">
    <div className="spats-tour-top"><span>SPATS QUICK START</span><button type="button" onClick={finish}>Skip tour ✕</button></div>
    <div className="spats-tour-progress"><span style={{width:((step+1)/steps.length*100)+'%'}}/></div>
    <small>STEP {step+1} OF {steps.length}</small>
    <h2>{steps[step].title}</h2><p>{steps[step].description}</p>
    <div className="spats-tour-actions"><button type="button" disabled={step===0} onClick={()=>{const previous=Math.max(0,step-1);setStep(previous);if(steps[previous].href)router.push(steps[previous].href)}}>Back</button><button type="button" className="primary" onClick={next}>{step===steps.length-1?'Finish Tour':'Next →'}</button></div>
   </section>
  </div>}
 </>;
}
