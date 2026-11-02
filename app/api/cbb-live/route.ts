import {NextResponse} from 'next/server';
export const runtime='nodejs';
export async function GET(){
 try{
  const date=new Date();const y=date.getUTCFullYear(),m=String(date.getUTCMonth()+1).padStart(2,'0'),d=String(date.getUTCDate()).padStart(2,'0');
  const url='https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=50&limit=500&dates='+y+m+d;
  const r=await fetch(url,{next:{revalidate:45},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('ESPN scoreboard returned '+r.status);
  const data=await r.json();
  const games=(data.events||[]).map((event:any)=>{
   const comp=event.competitions?.[0],home=comp?.competitors?.find((x:any)=>x.homeAway==='home'),away=comp?.competitors?.find((x:any)=>x.homeAway==='away');
   return {id:String(event.id),date:event.date,name:event.name,status:event.status?.type?.shortDetail||event.status?.type?.description||'Scheduled',state:event.status?.type?.state||'pre',home:home?.team?.displayName||'Home',away:away?.team?.displayName||'Away',homeScore:home?.score??null,awayScore:away?.score??null,homeLogo:home?.team?.logo||null,awayLogo:away?.team?.logo||null};
  });
  return NextResponse.json({games,updatedAt:new Date().toISOString(),source:'ESPN public NCAA Division I scoreboard'});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Scoreboard unavailable'},{status:502})}
}