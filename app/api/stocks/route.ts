import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const dynamic='force-dynamic';
export const runtime='nodejs';

type Row=Record<string,unknown>;
const id=(v:unknown)=>String(v??'');
const num=(v:unknown)=>typeof v==='number'?v:Number(v??0);
const clean=(v:unknown)=>Number.isFinite(num(v))?num(v):0;

type EspnTeam={id:string;displayName:string;name:string;location:string;shortDisplayName:string;logos?:{href?:string}[]};
const norm=(v:string)=>v.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const expand=(v:string)=>norm(v).replace(/^st /,'saint ').replace(/^unc /,'north carolina ').replace(/^uc /,'california ').replace(/^uconn /,'connecticut ').replace(/^umass /,'massachusetts ').replace(/^miami oh /,'miami ohio ').replace(/^miami fl /,'miami florida ');
async function officialTeamLogos():Promise<Map<string,string>>{
 const logos=new Map<string,string>();
 try{
  const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?group=50&limit=1000',{next:{revalidate:86400}});
  if(!response.ok) return logos;
  const payload=await response.json();
  const entries=(payload?.sports?.[0]?.leagues?.[0]?.teams||[]) as Array<{team?:EspnTeam}>;
  for(const entry of entries){
   const t=entry.team;
   if(!t)continue;
   const url=t.logos?.find(l=>typeof l.href==='string'&&l.href.startsWith('https://'))?.href;
   if(!url)continue;
   for(const value of [t.displayName,t.shortDisplayName]){
    if(!value)continue;
    const key=expand(value);
    // Ambiguous normalized names must never map to a random team's logo.
    if(logos.has(key)&&logos.get(key)!==url)logos.set(key,'');
    else if(!logos.has(key))logos.set(key,url);
   }
  }
 }catch(error){console.warn('SPATS team logo directory unavailable:',error instanceof Error?error.message:'Unknown response');}
 return logos;
}

function market(){
 const url=process.env.SPATS_MARKET_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SPATS_MARKET_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return null;
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).schema('spats_market');
}
const fail=(message:string,status=503,code?:string)=>NextResponse.json({error:message,...(code?{code}:{})},{status,headers:{'Cache-Control':'no-store'}});
function dbError(e:unknown){
 if(e && typeof e==='object'){
  const o=e as Record<string,unknown>;
  return {code:String(o.code||'UNKNOWN'),message:String(o.message||'Unknown database error'),details:String(o.details||'')};
 }
 return {code:'UNKNOWN',message:e instanceof Error?e.message:String(e),details:''};
}
export async function GET(req:NextRequest){
 const db=market();
 if(!db)return fail('Market connection is not configured. Add server-side Supabase credentials.');
 const kind=req.nextUrl.searchParams.get('kind')||'overview';
 const identifier=req.nextUrl.searchParams.get('id')||'';
 try{
  if(kind==='portrait'){
   const name=req.nextUrl.searchParams.get('name')||'';
   const teamLogo=req.nextUrl.searchParams.get('teamLogo')||'';
   if(name.length<3||name.length>130)return fail('Invalid player.',400);
   // Reuse the same ESPN roster/headshot feed used by the CBB Rankings page.
   // An ESPN school ID comes only from a previously verified ESPN team-logo URL.
   const logoMatch=teamLogo.match(/^https:\/\/(?:a\.)?espncdn\.com\/i\/teamlogos\/ncaa\/(?:500|500-dark|500-light|200|100)\/(\d+)\.png(?:\?.*)?$/);
   let photoUrl:string|null=null;
   if(logoMatch){
    try{
     const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${logoMatch[1]}/roster`,{next:{revalidate:86400}});
     if(response.ok){
      const roster=await response.json();
      const groups=Array.isArray(roster?.athletes)?roster.athletes:[];
      const athletes=groups.flatMap((g:Row)=>Array.isArray(g.items)?g.items:[g]);
      const matched=athletes.filter((athlete:Row)=>expand(id(athlete.displayName||athlete.fullName))===expand(name));
      if(matched.length===1){
       const href=id(matched[0]?.headshot?.href);
       if(/^https:\/\/[^/]*espncdn\.com\//.test(href))photoUrl=href;
      }
     }
    }catch{}
   }
   return NextResponse.json({photoUrl},{headers:{'Cache-Control':'public, max-age=3600'}});
  }
  if(kind==='history'){
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(identifier))return fail('Invalid stock identifier.',400);
   const asset=req.nextUrl.searchParams.get('asset');
   if(asset==='team'){
    const {data:hist,error}=await db.from('elo_history').select('game_id,rating_before,rating_after').eq('team_id',identifier).limit(1000);
    if(error)throw error;
    const history=(hist||[]) as Row[];
    const ids=[...new Set(history.map(r=>id(r.game_id)).filter(Boolean))];
    const gameMap=new Map<string,Row>();
    for(let i=0;i<ids.length;i+=150){
     const {data:games,error:ge}=await db.from('games').select('id,game_date,season,home_team_id,away_team_id,home_score,away_score,status').in('id',ids.slice(i,i+150));
     if(ge)throw ge;
     for(const g of games||[])gameMap.set(id(g.id),g as Row);
    }
    const opponents=[...new Set(Array.from(gameMap.values()).flatMap(g=>[id(g.home_team_id),id(g.away_team_id)]))].filter(Boolean);
    const teamNames=new Map<string,string>();
    for(let i=0;i<opponents.length;i+=150){
     const {data:teams,error:te}=await db.from('teams').select('id,name').in('id',opponents.slice(i,i+150));
     if(te)throw te;
     for(const t of teams||[])teamNames.set(id(t.id),id(t.name));
    }
    const data=history.map(r=>{
     const g=gameMap.get(id(r.game_id));
     if(!g||!g.game_date)return null;
     const home=id(g.home_team_id)===identifier;
     const opponentId=home?id(g.away_team_id):id(g.home_team_id);
     const ownScore=home?g.home_score:g.away_score;
     const opponentScore=home?g.away_score:g.home_score;
     const before=100*Math.pow(2,(clean(r.rating_before)-1500)/300);
     const after=100*Math.pow(2,(clean(r.rating_after)-1500)/300);
     const result=ownScore==null||opponentScore==null?null:clean(ownScore)>clean(opponentScore)?'W':clean(ownScore)<clean(opponentScore)?'L':null;
     return {gameId:id(r.game_id),date:id(g.game_date),season:clean(g.season),value:Math.round(after*100)/100,priceBefore:Math.round(before*100)/100,priceChange:Math.round((after-before)*100)/100,opponent:teamNames.get(opponentId)||'Opponent unavailable',score:ownScore==null||opponentScore==null?null:`${clean(ownScore)}–${clean(opponentScore)}`,result};
    }).filter((v):v is NonNullable<typeof v>=>v!==null).sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId));
    return NextResponse.json({data,latestGameDate:data[data.length-1]?.date||null,source:'SPATS team stock price history'},{headers:{'Cache-Control':'no-store'}});
   }
   if(asset==='player'){
    const {data,error}=await db.from('player_price_history').select('game_id,event_time,price_after,price_before,change_pct,event_type').eq('player_id',identifier).order('event_time',{ascending:true}).limit(1000);
    if(error)throw error;
    const records=(data||[]) as Row[];
    const gameIds=[...new Set(records.map(r=>id(r.game_id)).filter(v=>v&&v!=='null'))];
    const gameMap=new Map<string,Row>();
    for(let i=0;i<gameIds.length;i+=150){
     const {data:games,error:ge}=await db.from('games').select('id,game_date,home_team_id,away_team_id,home_score,away_score').in('id',gameIds.slice(i,i+150));
     if(ge)throw ge;
     for(const g of games||[])gameMap.set(id(g.id),g as Row);
    }
    const teamSet=[...new Set(Array.from(gameMap.values()).flatMap(g=>[id(g.home_team_id),id(g.away_team_id)]))].filter(Boolean);
    const names=new Map<string,string>();
    for(let i=0;i<teamSet.length;i+=150){
     const {data:teams,error:te}=await db.from('teams').select('id,name').in('id',teamSet.slice(i,i+150));
     if(te)throw te;
     for(const t of teams||[])names.set(id(t.id),id(t.name));
    }
    const playerTeamByGame=new Map<string,string>();
    for(let i=0;i<gameIds.length;i+=150){
     const {data:appearances,error:pe}=await db.from('player_games').select('game_id,team_id').eq('player_id',identifier).in('game_id',gameIds.slice(i,i+150));
     if(pe)throw pe;
     for(const p of appearances||[])playerTeamByGame.set(id(p.game_id),id(p.team_id));
    }
    const rows=records.map(r=>{
     const gameId=id(r.game_id),g=gameMap.get(gameId),ownTeam=playerTeamByGame.get(gameId);
     const isHome=g&&ownTeam?id(g.home_team_id)===ownTeam:null;
     const other=isHome===null?'':isHome?id(g?.away_team_id):id(g?.home_team_id);
     const ownScore=isHome===null?null:isHome?g?.home_score:g?.away_score;
     const otherScore=isHome===null?null:isHome?g?.away_score:g?.home_score;
     const result=ownScore==null||otherScore==null?null:clean(ownScore)>clean(otherScore)?'W':clean(ownScore)<clean(otherScore)?'L':null;
     return {gameId,date:id(g?.game_date||r.event_time),value:clean(r.price_after),priceBefore:r.price_before==null?null:clean(r.price_before),priceChange:r.price_before==null?null:Math.round((clean(r.price_after)-clean(r.price_before))*100)/100,change:clean(r.change_pct),event:id(r.event_type),opponent:other?names.get(other)||null:null,score:ownScore==null||otherScore==null?null:`${clean(ownScore)}–${clean(otherScore)}`,result};
    }).sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId));
    return NextResponse.json({data:rows,latestGameDate:rows[rows.length-1]?.date||null,source:'SPATS player stock history'},{headers:{'Cache-Control':'no-store'}});
   }
   return fail('Invalid stock type.',400);
  }
  if(kind!=='overview')return fail('Unknown request.',400);
  const [teamsResult,ratingsResult,playerSeasonsResult,playerRatingsResult]=await Promise.all([
   db.from('teams').select('id,name,conference').eq('is_active',true).limit(500),
   db.from('current_ratings').select('team_id,stock_price,games_processed,updated_at').limit(500),
   db.from('player_seasons').select('player_id,team_id,season,points_per_game,rebounds_per_game,assists_per_game').eq('season',2027).limit(1500),
   db.from('player_ratings').select('player_id,season,stock_price,opening_price,games_processed,updated_at').eq('season',2027).limit(1500)
  ]);
  if(teamsResult.error)throw teamsResult.error;
  if(ratingsResult.error)throw ratingsResult.error;
  const [currentGamesResult,currentBoxscoreResult]=await Promise.all([
   db.from('games').select('id,game_date',{count:'exact'}).eq('season',2027).eq('status','final').order('game_date',{ascending:false}).limit(1),
   db.from('player_games').select('game_id').eq('season',2027).limit(10000)
  ]);
  const latestGameDate=(currentGamesResult.data||[])[0]?.game_date||null;
  const playerGamesCovered=new Set((currentBoxscoreResult.data||[]).map(r=>id(r.game_id))).size;
  const coverage={season:2027,teamGames:currentGamesResult.count??0,latestTeamGameDate:latestGameDate,playerGamesCovered,playerCoveragePartial:Boolean(currentBoxscoreResult.error)||(currentBoxscoreResult.data||[]).length>=1000};
  const logoByName=await officialTeamLogos();
  const ratingById=new Map((ratingsResult.data||[]).map((r:Row)=>[id(r.team_id),r]));
  const teams=(teamsResult.data||[]).map((r:Row)=>{const rating=ratingById.get(id(r.id));return {id:id(r.id),name:id(r.name),conference:id(r.conference),logoUrl:logoByName.get(expand(id(r.name)))||null,price:rating?clean(rating.stock_price):null,games:rating?clean(rating.games_processed):0,updatedAt:rating?id(rating.updated_at):null};}).sort((a,b)=>(b.price??-1)-(a.price??-1));
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
  return NextResponse.json({teams,players,coverage,playerWarning,asOf:new Date().toISOString(),playerPricesPublished:players.some(p=>typeof p.price==='number')},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  const err=dbError(e);
  console.error('SPATS market snapshot error:',JSON.stringify(err));
  const detail=err.message.toLowerCase();
  const schemaError=err.code==='PGRST106'||detail.includes('schema')||detail.includes('exposed');
  const missingTable=err.code==='PGRST205'||err.code==='42P01'||detail.includes('does not exist')||detail.includes('could not find the table');
  const permission=err.code==='42501'||detail.includes('permission denied');
  return fail(schemaError
   ?'Supabase cannot access the spats_market schema through its REST API. Add spats_market to Exposed schemas in Supabase API settings.'
   :missingTable
   ?'The connected Supabase project does not expose the expected SPATS market tables. Confirm the website points to the stock-market Supabase project.'
   :permission
   ?'The SPATS market database role lacks permission to read the spats_market tables.'
   :'Unable to read SPATS market tables. Check Supabase project connection and schema access.',503,err.code);
 }
}
