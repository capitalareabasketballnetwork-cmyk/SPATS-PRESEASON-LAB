import {NextResponse} from 'next/server';
export const revalidate=86400;
type ESPNPlayer={id?:string;displayName?:string;fullName?:string;jersey?:string;position?:{abbreviation?:string;displayName?:string};experience?:{displayValue?:string;years?:number};class?:string;headshot?:{href?:string};statistics?:unknown};
export async function GET(request:Request){
 const url=new URL(request.url);const id=url.searchParams.get('team')||'';
 if(!/^\d{1,7}$/.test(id))return NextResponse.json({error:'Invalid team ID'},{status:400});
 try{
 const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/'+id+'/roster',{next:{revalidate:86400},headers:{'Accept':'application/json'}});
 if(!response.ok)throw new Error('Roster provider returned '+response.status);
 const json=await response.json();
 const groups=Array.isArray(json.athletes)?json.athletes:[];
 const raw=groups.flatMap((g:ESPNPlayer|{items?:ESPNPlayer[]})=>('items' in g&&Array.isArray(g.items)?g.items:[g as ESPNPlayer]));
 const players=raw.filter((p:ESPNPlayer)=>p.id&&p.displayName||p.fullName).map((p:ESPNPlayer)=>({id:String(p.id),name:p.displayName||p.fullName||'',jersey:p.jersey||'',position:p.position?.abbreviation||p.position?.displayName||'',year:p.experience?.displayValue||p.class||(typeof p.experience?.years==='number'?String(p.experience.years):''),photo:p.headshot?.href||'',stats:p.statistics||null}));
 return NextResponse.json({players,source:'ESPN current roster',season:'2026–27',notice:'Current roster only. Historical player stats and transfer classification require separate season-verified sources.'});
 }catch{return NextResponse.json({players:[],error:'Roster currently unavailable from the provider'},{status:502})}
}