import {NextResponse} from 'next/server';
export const revalidate=86400;
export async function GET(request:Request){
 const q=new URL(request.url).searchParams;const team=q.get('team')||'';const season=Number(q.get('season'));
 if(!/^\d{1,7}$/.test(team)||!Number.isInteger(season)||season<2010||season>2027)return NextResponse.json({error:'Invalid team or season'},{status:400});
 try{
 const url='https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/'+team+'/schedule?season='+season+'&limit=500';
 const res=await fetch(url,{next:{revalidate:86400}});
 if(!res.ok)throw new Error('Schedule unavailable');
 const data=await res.json();const events=Array.isArray(data.events)?data.events:[];
 let wins=0,losses=0;
 for(const event of events){const competition=event.competitions?.[0];if(!competition?.status?.type?.completed&&!event.status?.type?.completed)continue;
 const competitors=competition?.competitors||[];const own=competitors.find((c:{team?:{id?:string}})=>String(c.team?.id)===team);
 const opp=competitors.find((c:{team?:{id?:string}})=>String(c.team?.id)!==team);
 if(!own||!opp)continue;
 const a=Number(own.score?.value??own.score);const b=Number(opp.score?.value??opp.score);
 if(Number.isFinite(a)&&Number.isFinite(b)&&a!==b){if(a>b)wins++;else losses++}
 else if(typeof own.winner==='boolean'){if(own.winner)wins++;else losses++}
 }
 return NextResponse.json({wins,losses,games:wins+losses,events:events.length,source:'ESPN full season team schedule',season,complete:events.length>0});
 }catch{return NextResponse.json({wins:null,losses:null,games:0,complete:false,error:'Full-season record unavailable'})}
}
