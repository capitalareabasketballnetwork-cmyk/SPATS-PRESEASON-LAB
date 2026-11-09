import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const dynamic='force-dynamic';
export const runtime='nodejs';

type Row=Record<string,unknown>;
const id=(v:unknown)=>String(v??'');
const num=(v:unknown)=>typeof v==='number'?v:Number(v??0);
const clean=(v:unknown)=>Number.isFinite(num(v))?num(v):0;
function market(){
 const url=process.env.SPATS_MARKET_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SPATS_MARKET_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return null;
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).schema('spats_market');
}
const fail=(message:string,status=503)=>NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
 const db=market();
 if(!db)return fail('Market connection is not configured. Add server-side Supabase credentials.');
 const kind=req.nextUrl.searchParams.get('kind')||'overview';
 const identifier=req.nextUrl.searchParams.get('id')||'';
 try{
  if(kind==='history'){
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(identifier))return fail('Invalid stock identifier.',400);
   const asset=req.nextUrl.searchParams.get('asset');
   if(asset==='team'){
    const {data:hist,error}=await db.from('elo_history').select('game_id,rating_before,rating_after,rating_change').eq('team_id',identifier).limit(1000);
    if(error)throw error;
    const ids=[...new Set((hist||[]).map((v:Row)=>id(v.game_id)))];
    const dates:Record<string,string>={};
    for(let i=0;i<ids.length;i+=200){
     const {data:games,error:ge}=await db.from('games').select('id,game_date').in('id',ids.slice(i,i+200));
     if(ge)throw ge;
     for(const g of games||[])dates[id(g.id)]=id(g.game_date);
    }
    const data=(hist||[]).map((r:Row)=>({gameId:id(r.game_id),date:dates[id(r.game_id)]||'',value:Math.round((100*Math.pow(2,(clean(r.rating_after)-1500)/300))*100)/100,elo:clean(r.rating_after),change:clean(r.rating_change)})).filter(x=>x.date).sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId));
    return NextResponse.json({data,source:'SPATS Elo V3 team stock history'}, {headers:{'Cache-Control':'no-store'}});
   }
   if(asset==='player'){
    const {data,error}=await db.from('player_price_history').select('game_id,event_time,price_after,change_pct,event_type').eq('player_id',identifier).order('event_time',{ascending:true}).limit(1000);
    if(error)throw error;
    return NextResponse.json({data:(data||[]).map((r:Row)=>({gameId:id(r.game_id),date:id(r.event_time),value:clean(r.price_after),change:clean(r.change_pct),event:id(r.event_type)})),source:'SPATS player stock history'},{headers:{'Cache-Control':'no-store'}});
   }
   return fail('Invalid stock type.',400);
  }
  if(kind!=='overview')return fail('Unknown request.',400);
  const [teamsResult,ratingsResult,playerSeasonsResult,playerRatingsResult]=await Promise.all([
   db.from('teams').select('id,name,conference').eq('is_active',true).limit(500),
   db.from('current_ratings').select('team_id,elo_rating,stock_price,games_processed,updated_at').limit(500),
   db.from('player_seasons').select('player_id,team_id,season,points_per_game,rebounds_per_game,assists_per_game').eq('season',2027).limit(1500),
   db.from('player_ratings').select('player_id,season,stock_price,opening_price,games_processed,updated_at').eq('season',2027).limit(1500)
  ]);
  if(teamsResult.error)throw teamsResult.error;
  if(ratingsResult.error)throw ratingsResult.error;
  const ratingById=new Map((ratingsResult.data||[]).map((r:Row)=>[id(r.team_id),r]));
  const teams=(teamsResult.data||[]).map((r:Row)=>{const rating=ratingById.get(id(r.id));return {id:id(r.id),name:id(r.name),conference:id(r.conference),price:rating?clean(rating.stock_price):null,elo:rating?clean(rating.elo_rating):null,games:rating?clean(rating.games_processed):0,updatedAt:rating?id(rating.updated_at):null};}).sort((a,b)=>(b.price??-1)-(a.price??-1));
  let players:Array<Record<string,unknown>>=[];
  let playerWarning='';
  if(playerSeasonsResult.error){playerWarning=playerSeasonsResult.error.message;}
  else{
   const seasons=playerSeasonsResult.data||[];
   const pids=[...new Set(seasons.map((s:Row)=>id(s.player_id)))].filter(Boolean);
   const playerById=new Map<string,Row>();
   for(let i=0;i<pids.length;i+=200){
    const {data,error}=await db.from('players').select('id,full_name,position').in('id',pids.slice(i,i+200));
    if(error){playerWarning=error.message;break}
    for(const p of data||[])playerById.set(id(p.id),p);
   }
   const priced=new Map((playerRatingsResult.data||[]).map((p:Row)=>[id(p.player_id),p]));
   players=seasons.map((s:Row)=>{const p=playerById.get(id(s.player_id));const r=priced.get(id(s.player_id));return {id:id(s.player_id),name:id(p?.full_name)||'Unknown player',position:id(p?.position),teamId:id(s.team_id),price:r?clean(r.stock_price):null,openingPrice:r?clean(r.opening_price):null,ppg:s.points_per_game==null?null:clean(s.points_per_game),rpg:s.rebounds_per_game==null?null:clean(s.rebounds_per_game),apg:s.assists_per_game==null?null:clean(s.assists_per_game),games:r?clean(r.games_processed):null};}).sort((a,b)=>Number(b.price??-1)-Number(a.price??-1));
  }
  return NextResponse.json({teams,players,playerWarning,asOf:new Date().toISOString(),playerPricesPublished:players.some(p=>typeof p.price==='number')},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  const message=e instanceof Error?e.message:String(e);
  console.error('SPATS market snapshot error:',message);
  return fail(message.includes('schema')?'Market schema is not exposed to the Supabase REST API. Expose spats_market or provide a public-schema read RPC.':'Unable to read SPATS market tables. Check the project connection and schema access.');
 }
}
