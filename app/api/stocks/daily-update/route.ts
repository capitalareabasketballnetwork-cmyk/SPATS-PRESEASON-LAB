import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export const dynamic='force-dynamic';
export const runtime='nodejs';
// Imports and the historical replay may take longer than ordinary API reads.
export const maxDuration=300;

type Stage={step:string;ok:boolean;status:number;detail?:string};
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const timestamp=(date:Date)=>date.toISOString().slice(0,10);
const dateOffset=(days:number)=>{
 const date=new Date();
 date.setUTCDate(date.getUTCDate()+days);
 return timestamp(date);
};

export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return reply({error:'Unauthorized'},401);
 const url=(process.env.SPATS_MARKET_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
 const key=process.env.SPATS_MARKET_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return reply({error:'Supabase market credentials not configured'},503);
 const serviceKey:string=key;
 const startedAt=new Date().toISOString();
 const results:Stage[]=[];
 async function invoke(step:string,fn:string,payload:unknown){
  const response=await fetch(`${url}/functions/v1/${fn}`,{
   method:'POST',
   headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json'},
   body:JSON.stringify(payload),
   cache:'no-store',
   signal:AbortSignal.timeout(90000)
  });
  const responseText=await response.text();
  if(!response.ok){
   results.push({step,ok:false,status:response.status,detail:responseText.slice(0,800)});
   throw new Error(`${step} failed with HTTP ${response.status}`);
  }
  let data:Record<string,unknown>={};
  try{data=JSON.parse(responseText)}catch{data={message:responseText.slice(0,400)}}
  if(data.error||data.success===false){
   results.push({step,ok:false,status:200,detail:JSON.stringify(data).slice(0,800)});
   throw new Error(`${step} reported an error`);
  }
  results.push({step,ok:true,status:response.status,detail:JSON.stringify(data).slice(0,800)});
  console.info('SPATS daily market update:',step,JSON.stringify(data).slice(0,1800));
 }
 try{
  // Imports today and two previous UTC dates, retrying late-reported final games.
  // The deployed import-cbb-games function runs sync_and_calculate_spats_v3.
  await invoke('team games + V3 team ratings','import-cbb-games',{commit:true});
  // The player importer is idempotent for previously processed games.
  await invoke('player box scores','import-cbb-players',{
   startDate:dateOffset(-2),endDate:dateOffset(0),commit:true
  });
  // The existing V1-V3 calculations and import RPCs reside in public.
  // V5 is optional until its database function is installed; don't mark
  // successfully imported team games as a failure solely because V5 is absent.
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc('calculate_player_v5');
  if(error){
   const missing=error.code==='PGRST202'||error.code==='42883'||/could not find the function|does not exist/i.test(error.message);
   results.push({step:'V5 player prices',ok:false,status:missing?404:500,detail:`${error.code||''} ${error.message}`.slice(0,800)});
   if(!missing)throw new Error('V5 player prices failed: '+error.message);
   console.warn('SPATS daily market update: V5 unavailable; team imports completed.');
  }else{
   results.push({step:'V5 player prices',ok:true,status:200,detail:JSON.stringify(data).slice(0,800)});
  }
  const complete=results.every(stage=>stage.ok);
  console.info('SPATS daily market update: completed',JSON.stringify({startedAt,complete,results}));
  return reply({ok:complete,partial:!complete,startedAt,finishedAt:new Date().toISOString(),results});
 }catch(error){
  console.error('SPATS daily market update failed',JSON.stringify({startedAt,results,error:error instanceof Error?error.message:String(error)}));
  return reply({ok:false,startedAt,finishedAt:new Date().toISOString(),results,error:error instanceof Error?error.message:'Unknown update error'},500);
 }
}
