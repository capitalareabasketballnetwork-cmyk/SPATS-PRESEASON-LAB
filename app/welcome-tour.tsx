'use client';
import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {useRouter,usePathname} from 'next/navigation';

const steps=[
 {title:'Welcome to SPATS',description:'You will build, test, and save your own NFL prediction model during this tour. Your saved model will then be available in the other SPATS tools.',target:'',href:'/football?tab=builder'},
 {title:'Choose your statistics',description:'Select the statistics you think matter. You can use the default selections, add more, or remove some. Make sure the weights total 1.000 before computing.',target:'[data-tour="stats"]',href:'/football?tab=builder'},
 {title:'Compute your first model',description:'Now click the highlighted Compute Model button. Wait for the historical backtest to finish. This step advances only after the computation succeeds.',target:'[data-tour="compute"]',href:'/football?tab=builder',required:'computed'},
 {title:'Save your own model',description:'Review your results, type a name for your model, and click Save to Account. We will wait until your model is actually saved to your account.',target:'[data-tour="save"]',href:'/football?tab=builder',required:'saved'},
 {title:'Explore the Odds Calculator',description:'Your saved model is now available for hypothetical moneyline, spread, and over/under simulations. Select it in the Odds Calculator to test historical results.',target:'.nfl-tabs',href:'/football?tab=odds'},
 {title:'Try Upcoming Games',description:'Use This Week’s Picks or Upcoming Games to see predictions from your saved model. Confidence and historical profit are educational, not guaranteed future outcomes.',target:'.nfl-upcoming-link',href:'/football?tab=odds'},
 {title:'You are ready!',description:'Your model is saved to your account, ready to use throughout SPATS. You can restart the tour anytime from Take a Tour.',target:'',href:'/football?tab=builder'}
] as const;
export default function WelcomeTour({user}:{user:User}){
 const router=useRouter(),pathname=usePathname();
 const [step,setStep]=useState<number|null>(null);
 const [rect,setRect]=useState<{top:number;left:number;width:number;height:number}|null>(null);
 const [cardPos,setCardPos]=useState<React.CSSProperties>({});
 const [savedName,setSavedName]=useState('');
 const key='spats-tour-v2-'+user.id;
 useEffect(()=>{if(!localStorage.getItem(key))setStep(0)},[key]);
 useEffect(()=>{
  if(step===null)return;
  const onComputed=()=>setStep(current=>current===2?3:current);
  const onSaved=(e:Event)=>{const name=(e as CustomEvent<{name:string}>).detail?.name||'Your model';setSavedName(name);setStep(current=>current===3?4:current)};
  window.addEventListener('spats-tour-computed',onComputed);window.addEventListener('spats-tour-saved',onSaved);
  return()=>{window.removeEventListener('spats-tour-computed',onComputed);window.removeEventListener('spats-tour-saved',onSaved)}
 },[step]);
 useEffect(()=>{
  if(step===null){setRect(null);return}
  let highlighted:HTMLElement|null=null;
  const update=()=>{
   const el=steps[step].target?document.querySelector<HTMLElement>(steps[step].target):null;
   if(highlighted&&highlighted!==el)highlighted.classList.remove('spats-tour-highlighted');
   highlighted=el;
   if(!el){setRect(null);setCardPos({});return}
   el.classList.add('spats-tour-highlighted');
   const r=el.getBoundingClientRect();
   if(!r.width||!r.height){setRect(null);setCardPos({});return}
   setRect({top:r.top,left:r.left,width:r.width,height:r.height});
   const cardWidth=Math.min(390,window.innerWidth-32);
   const spaceRight=window.innerWidth-r.right,spaceLeft=r.left;
   if(spaceRight>=cardWidth+26)setCardPos({position:'fixed',left:r.right+16,top:Math.max(12,Math.min(r.top,window.innerHeight-340)),width:cardWidth});
   else if(spaceLeft>=cardWidth+26)setCardPos({position:'fixed',left:r.left-cardWidth-16,top:Math.max(12,Math.min(r.top,window.innerHeight-340)),width:cardWidth});
   else if(r.bottom+340<window.innerHeight)setCardPos({position:'fixed',left:Math.max(16,Math.min(window.innerWidth-cardWidth-16,r.left)),top:r.bottom+14,width:cardWidth});
   else if(r.top>=340)setCardPos({position:'fixed',left:Math.max(16,Math.min(window.innerWidth-cardWidth-16,r.left)),bottom:window.innerHeight-r.top+14,width:cardWidth});
   else setCardPos({position:'fixed',bottom:12,left:'50%',transform:'translateX(-50%)',width:cardWidth});
  };
  const timer=window.setInterval(update,350);update();
  return()=>{window.clearInterval(timer);highlighted?.classList.remove('spats-tour-highlighted')}
 },[step,pathname]);
 const navigate=(n:number)=>{setStep(n);const next=steps[n];if(next.href)router.push(next.href)};
 const finish=()=>{localStorage.setItem(key,'done');setStep(null)};
 const next=()=>{if(step===null)return;if(step===steps.length-1)finish();else if(!('required' in steps[step]))navigate(step+1)};
 return <>
  <button className="spats-tour-restart" type="button" onClick={()=>navigate(0)}>ⓘ Take a Tour</button>
  {step!==null&&<div className="spats-tour-overlay" role="dialog" aria-modal="false" aria-label="SPATS interactive onboarding">
   {rect&&<div className="spats-tour-spotlight" style={{top:Math.max(0,rect.top-8),left:Math.max(0,rect.left-8),width:rect.width+16,height:rect.height+16}}/>}
   {!rect&&<div className="spats-tour-shade"/>}
   <section className="spats-tour-card" style={cardPos}>
    <div className="spats-tour-top"><span>SPATS HANDS-ON TOUR</span><button type="button" onClick={finish}>Skip tour ✕</button></div>
    <div className="spats-tour-progress"><span style={{width:((step+1)/steps.length*100)+'%'}}/></div>
    <small>STEP {step+1} OF {steps.length}</small>
    <h2>{steps[step].title}</h2><p>{steps[step].description}</p>
    {step===4&&savedName&&<p className="spats-tour-success">✓ Saved: {savedName}</p>}
    {(step===2||step===3)&&<p className="spats-tour-hint">Interact with the highlighted website controls to continue.</p>}
    <div className="spats-tour-actions"><button type="button" disabled={step===0} onClick={()=>navigate(Math.max(0,step-1))}>Back</button><button type="button" className="primary" disabled={step===2||step===3} onClick={next}>{step===2?'Waiting for Compute…':step===3?'Waiting for Save…':step===steps.length-1?'Finish Tour':'Next →'}</button></div>
   </section>
  </div>}
 </>;
}
