import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!secret)return NextResponse.json({error:'Schedule service not configured'},{status:503});
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token)return NextResponse.json({error:'Sign in required'},{status:401});
 const auth=createClient(url,anon,{auth:{persistSession:false}});
 const {data:{user}}=await auth.auth.getUser(token);
 if(!user)return NextResponse.json({error:'Invalid session'},{status:401});
 const db=createClient(url,secret,{auth:{persistSession:false}});
 const {data:member}=await db.from('nfl_club_members').select('club_id').eq('user_id',user.id).limit(1);
 if(!member?.length)return NextResponse.json({error:'League membership required'},{status:403});
 try{
  const weeks=await Promise.all(Array.from({length:18},async(_,i)=>{
   const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&limit=100&week='+(i+1),{next:{revalidate:900}});
   if(!response.ok)throw Error('Schedule source failed for week '+(i+1));
   const json=await response.json();
   return (json.events||[]).flatMap((event:any)=>{
    const comp=event.competitions?.[0],teams=comp?.competitors||[];
    const home=teams.find((t:any)=>t.homeAway==='home'),away=teams.find((t:any)=>t.homeAway==='away');
    if(!home||!away||!event.date)return [];
    const final=event.status?.type?.completed===true||comp?.status?.type?.completed===true;
    return [{game_id:String(event.id),season:2026,week:i+1,kickoff_at:event.date,home_team:home.team.abbreviation,away_team:away.team.abbreviation,home_score:final?Number(home.score):null,away_score:final?Number(away.score):null,status:final?'final':'scheduled'}];
   });
  }));
  const games=weeks.flat();
  if(games.length<200)throw Error('Incomplete schedule returned; no games updated');
  const {error}=await db.from('nfl_club_games').upsert(games,{onConflict:'game_id'});
  if(error)throw error;
  return NextResponse.json({ok:true,count:games.length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:502})}
}
