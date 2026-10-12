import {NextResponse} from 'next/server';
export const revalidate=86400;
export async function GET(){
try{
const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500',{next:{revalidate:86400}});
if(!response.ok)throw new Error('Directory unavailable');
const data=await response.json();
const teams=(data.sports||[]).flatMap((sport:any)=>(sport.leagues||[]).flatMap((league:any)=>(league.teams||[]).map((item:any)=>({id:String(item.team.id),name:item.team.displayName}))));
if(!teams.some((t:any)=>t.id==='2117'))teams.push({id:'2117',name:'Central Michigan Chippewas'});
return NextResponse.json({teams,count:teams.length});
}catch{return NextResponse.json({teams:[{id:'2117',name:'Central Michigan Chippewas'}],partial:true})}
}
