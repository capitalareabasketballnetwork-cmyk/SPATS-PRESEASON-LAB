import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 try{
  const requested=req.nextUrl.searchParams.get('date');if(requested&&!/^\d{4}-\d{2}-\d{2}$/.test(requested))return NextResponse.json({error:'Invalid date'},{status:400});const date=requested?new Date(requested+'T12:00:00Z'):new Date();if(!Number.isFinite(date.getTime()))return NextResponse.json({error:'Invalid date'},{status:400});const y=date.getUTCFullYear(),m=String(date.getUTCMonth()+1).padStart(2,'0'),d=String(date.getUTCDate()).padStart(2,'0');
  const url='https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=50&limit=500&dates='+y+m+d;
  const r=await fetch(url,{next:{revalidate:45},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('ESPN scoreboard returned '+r.status);
  const data=await r.json();
  const games=(data.events||[]).map((event:any)=>{
   const comp=event.competitions?.[0],home=comp?.competitors?.find((x:any)=>x.homeAway==='home'),away=comp?.competitors?.find((x:any)=>x.homeAway==='away');
   return {id:String(event.id),date:event.date,name:event.name,status:event.status?.type?.shortDetail||event.status?.type?.description||'Scheduled',state:event.status?.type?.state||'pre',home:home?.team?.displayName||'Home',away:away?.team?.displayName||'Away',homeScore:home?.score??null,awayScore:away?.score??null,homeLogo:home?.team?.logo||null,awayLogo:away?.team?.logo||null,homeColor:home?.team?.color||null,awayColor:away?.team?.color||null};
  });
  let history:any[]=[];
  if(req.nextUrl.searchParams.get('history')==='1'){
   const seasonStart=new Date(Date.UTC(date.getUTCMonth()>=7?y:y-1,10,1));
   const first=new Date(Math.max(seasonStart.getTime(),date.getTime()-75*86400000));
   const ranges:string[]=[];
   for(let t=first.getTime();t<date.getTime();t+=7*86400000){const a=new Date(t),b=new Date(Math.min(t+6*86400000,date.getTime()-86400000));const fmt=(x:Date)=>x.toISOString().slice(0,10).replace(/-/g,'');ranges.push(fmt(a)+'-'+fmt(b))}
   const batches=await Promise.all(ranges.map(async range=>{try{const res=await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=50&limit=1000&dates='+range,{next:{revalidate:3600},signal:AbortSignal.timeout(14000)});if(!res.ok)return null;const json=await res.json();return json.events||[]}catch{return null}}));
   if(batches.every(b=>b!==null))history=[...new Map(batches.flat().map((e:any)=>[e.id,e])).values()].map((event:any)=>{const c=event.competitions?.[0],h=c?.competitors?.find((x:any)=>x.homeAway==='home'),a=c?.competitors?.find((x:any)=>x.homeAway==='away');return {id:String(event.id),date:event.date,home:h?.team?.displayName,away:a?.team?.displayName,homeScore:Number(h?.score),awayScore:Number(a?.score),final:event.status?.type?.completed===true,neutral:!!c?.neutralSite}}).filter((g:any)=>g.home&&g.away&&g.final&&Number.isFinite(g.homeScore)&&Number.isFinite(g.awayScore));
  }
  return NextResponse.json({history,historyComplete:req.nextUrl.searchParams.get('history')!=='1'||history.length>0,games,updatedAt:new Date().toISOString(),source:'ESPN public NCAA Division I scoreboard'});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Scoreboard unavailable'},{status:502})}
}