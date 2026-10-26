import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
export const maxDuration=300;
const origin='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&limit=100&week=';
type Game={game_id:string;week:number;date:string;home:string;away:string;homeScore:number|null;awayScore:number|null;final:boolean};
function parse(event:any,week:number):Game|null{
 const comp=event.competitions?.[0];const teams=comp?.competitors||[];
 const h=teams.find((x:any)=>x.homeAway==='home'),a=teams.find((x:any)=>x.homeAway==='away');
 if(!h||!a||!event.date)return null;
 const done=(comp?.status?.type?.completed||event.status?.type?.completed)===true;
 const hs=Number(h.score),as=Number(a.score);
 return {game_id:String(event.id),week,date:event.date,home:h.team.abbreviation,away:a.team.abbreviation,homeScore:done&&Number.isFinite(hs)?hs:null,awayScore:done&&Number.isFinite(as)?as:null,final:done&&Number.isFinite(hs)&&Number.isFinite(as)};
}
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'Missing Supabase server configuration'},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false}});
 try{
  const weeks=await Promise.all(Array.from({length:18},(_,i)=>fetch(origin+(i+1),{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('ESPN schedule '+(i+1));const j=await r.json();return (j.events||[]).map((e:any)=>parse(e,i+1)).filter(Boolean) as Game[]})));
  const games=weeks.flat();const now=Date.now();
  const {error:gameError}=await db.from('nfl_club_games').upsert(games.map(g=>({game_id:g.game_id,season:2026,week:g.week,kickoff_at:g.date,home_team:g.home,away_team:g.away,home_score:g.homeScore,away_score:g.awayScore,status:g.final?'final':'scheduled'})),{onConflict:'game_id'});
  if(gameError)throw gameError;
  const {data:models,error:modelError}=await db.from('nfl_club_models').select('id,club_id,user_id,model_snapshot,active_from').is('retired_at',null);
  if(modelError)throw modelError;
  const upcoming=games.filter(g=>new Date(g.date).getTime()>now+5*60*1000&&new Date(g.date).getTime()<now+14*86400000);
  let inserted=0,skipped=0;
  for(const m of models||[]){
   const snapshot=m.model_snapshot as {weights?:Record<string,number>};
   if(!snapshot?.weights||!Object.values(snapshot.weights).some(v=>Number(v)>0)){skipped++;continue}
   const response=await fetch(new URL('/api/football',req.nextUrl.origin),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({weights:snapshot.weights,start:2026,end:2026}),cache:'no-store'});
   if(!response.ok){skipped++;continue}
   const prediction=await response.json();const byId=new Map((prediction.games||[]).map((g:any)=>[String(g.game_id),g]));
   for(const game of upcoming){
    if(new Date(m.active_from).getTime()>=new Date(game.date).getTime()){skipped++;continue}
    const pick:any=byId.get(game.game_id);
    if(!pick?.pick||![game.home,game.away].includes(pick.pick)){skipped++;continue}
    const {error}=await db.from('nfl_club_picks').upsert({club_id:m.club_id,user_id:m.user_id,model_id:m.id,game_id:game.game_id,predicted_winner:pick.pick,confidence:pick.confidence,locked_at:game.date},{onConflict:'club_id,user_id,game_id',ignoreDuplicates:true});
    if(error)throw error;inserted++;
   }
  }
  const finished=games.filter(g=>g.final);
  let graded=0;
  for(const g of finished){
   const result=g.homeScore===g.awayScore?'tie':null;
   const {data:picks,error}=await db.from('nfl_club_picks').select('id,predicted_winner,result').eq('game_id',g.game_id).is('result',null);
   if(error)throw error;
   for(const p of picks||[]){
    const outcome=result||((p.predicted_winner===g.home?g.homeScore!>g.awayScore!:g.awayScore!>g.homeScore!)?'win':'loss');
    const {error:writeError}=await db.from('nfl_club_picks').update({result:outcome}).eq('id',p.id).is('result',null);
    if(writeError)throw writeError;graded++;
   }
  }
  return NextResponse.json({games:games.length,models:models?.length||0,inserted,skipped,graded});
 }catch(e){return NextResponse.json({error:String(e)},{status:500})}
}
