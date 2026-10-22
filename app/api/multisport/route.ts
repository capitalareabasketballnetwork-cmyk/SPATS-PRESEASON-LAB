import {NextRequest,NextResponse} from 'next/server';
import {leagues,type League,type Game} from '../../../lib/multisport-model';
export const runtime='nodejs';
export const maxDuration=60;
const known=(s:string):s is League=>Object.prototype.hasOwnProperty.call(leagues,s);
type Event={id?:string;date?:string;competitions?:Array<{competitors?:Array<{homeAway?:string;score?:string|number;team?:{displayName?:string;shortDisplayName?:string}}>;neutralSite?:boolean;status?:{type?:{completed?:boolean;state?:string}}}>;status?:{type?:{completed?:boolean;state?:string}}};
function parse(event:Event):Game|null{
 const competition=event.competitions?.[0];const home=competition?.competitors?.find(x=>x.homeAway==='home'),away=competition?.competitors?.find(x=>x.homeAway==='away');
 if(!home?.team||!away?.team||!event.id||!event.date)return null;
 const state=competition?.status?.type||event.status?.type;
 const final=state?.completed===true||state?.state==='post';
 const hs=home.score===undefined||home.score===''?null:Number(home.score),as=away.score===undefined||away.score===''?null:Number(away.score);
 return {id:event.id,date:event.date,home:home.team.displayName||home.team.shortDisplayName||'',away:away.team.displayName||away.team.shortDisplayName||'',homeScore:final&&hs!==null&&Number.isFinite(hs)?hs:null,awayScore:final&&as!==null&&Number.isFinite(as)?as:null,final:!!final&&hs!==null&&as!==null&&Number.isFinite(hs)&&Number.isFinite(as),neutral:!!competition?.neutralSite};
}
async function loadGames(league:League,season:number):Promise<{games:Game[];requests:number;failures:number}>{
 const l=leagues[league];const base='https://site.api.espn.com/apis/site/v2/sports/'+l.sport+'/'+l.division+'/scoreboard?limit=1000';
 const urls:string[]=[];
 if(league==='college-football'){
  for(const group of [80,81]){for(let week=1;week<=16;week++)urls.push(base+'&dates='+season+'&seasontype=2&week='+week+'&groups='+group);for(let week=1;week<=5;week++)urls.push(base+'&dates='+season+'&seasontype=3&week='+week+'&groups='+group)}
 }else{
  const first=season-1;
  const last=season;
  for(let year=first;year<=last;year++){
   const start=year===first?l.startMonth:1,end=year===last?l.endMonth:12;
   for(let month=start;month<=end;month++){
    const days=new Date(Date.UTC(year,month,0)).getUTCDate();
    const date=(d:number)=>String(year)+String(month).padStart(2,'0')+String(d).padStart(2,'0');
    for(let day=1;day<=days;day+=7){const last=Math.min(days,day+6);urls.push(base+'&dates='+date(day)+'-'+date(last)+(league==='college-basketball'?'&groups=50':''));}
   }
  }
 }
 let failures=0;const lists:Game[][]=[];for(let index=0;index<urls.length;index+=12){const batch=await Promise.all(urls.slice(index,index+12).map(async url=>{
  try{const response=await fetch(url,{next:{revalidate:21600},signal:AbortSignal.timeout(12000)});if(!response.ok){failures++;return []}
   const data=await response.json() as {events?:Event[]};return (data.events||[]).map(parse).filter((x):x is Game=>!!x);
  }catch{failures++;return []}
 }));lists.push(...batch)}
 const unique=new Map<string,Game>();for(const game of lists.flat())unique.set(game.id,game);
 return {games:[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)),requests:urls.length,failures};
}
export async function GET(req:NextRequest){
 const league=req.nextUrl.searchParams.get('league')||'',season=Number(req.nextUrl.searchParams.get('season'));
 if(!known(league)||!leagues[league].seasons.some(s=>s===season))return NextResponse.json({error:'Choose a supported league and season.'},{status:400});
 try{const data=await loadGames(league,season);
  if(!data.games.length)return NextResponse.json({error:'No verified games were returned for this season. The data source may be unavailable; no predictions were fabricated.',source:'ESPN public scoreboard',...data},{status:503});
  return NextResponse.json({...data,league,season,source:'ESPN public scoreboard (game results and schedules)',coverageWarning:data.failures?'Some date/week requests failed. Backtests may be incomplete.':null});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to load games'},{status:502})}
}
