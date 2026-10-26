import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
export const maxDuration=60;
type TeamStat={category:string;stat:string};
type Team={team:string;homeAway:string;stats:TeamStat[]};
type Box={id:number;teams:Team[]};
const wanted=['totalYards','netPassingYards','rushingYards','rushingAttempts','passAttempts','passCompletions','firstDowns','thirdDownEff','fourthDownEff','totalPenaltiesYards','possessionTime','turnovers'];
const parseValue=(raw:string)=>{const n=Number(raw.replace(/,/g,''));return Number.isFinite(n)?n:null};
function extract(team:Team){const raw=Object.fromEntries((team.stats||[]).map(s=>[s.category,s.stat]));const stats:Record<string,number|null>={};for(const key of wanted)stats[key]=raw[key]===undefined?null:parseValue(raw[key]);const split=(raw:string|undefined)=>raw?.match(/^(\d+)\s*-\s*(\d+)$/);const third=split(raw.thirdDownEff),fourth=split(raw.fourthDownEff),pen=split(raw.totalPenaltiesYards);const possession=raw.possessionTime?.match(/^(\d+):(\d+)$/);
 return {team:team.team,homeAway:team.homeAway,stats:{...stats,thirdDownConversionPct:third&&+third[2]>0?100*+third[1]/+third[2]:null,fourthDownConversionPct:fourth&&+fourth[2]>0?100*+fourth[1]/+fourth[2]:null,penalties:pen?+pen[1]:null,penaltyYards:pen?+pen[2]:null,possessionSeconds:possession?+possession[1]*60+ +possession[2]:null,plays:stats.rushingAttempts!==null&&stats.passAttempts!==null?stats.rushingAttempts+stats.passAttempts:null},raw}};
}
export async function GET(req:NextRequest){
 const season=Number(req.nextUrl.searchParams.get('season'));
 if(!Number.isInteger(season)||season<2004||season>2026)return NextResponse.json({error:'CFBD game-level team box scores are available from 2004 onward.'},{status:400});
 const token=(process.env.CFBD_API_KEY||'').trim();if(!token)return NextResponse.json({error:'CFBD_API_KEY is not configured.'},{status:503});
 const requests=Array.from({length:16},(_,i)=>i+1).map(async week=>{try{const url='https://api.collegefootballdata.com/games/teams?year='+season+'&week='+week+'&classification=fbs';const response=await fetch(url,{headers:{Authorization:'Bearer '+token},next:{revalidate:86400},signal:AbortSignal.timeout(20000)});if(!response.ok)return {week,error:'HTTP '+response.status,games:[] as Box[]};const games=await response.json() as Box[];return {week,error:'',games:Array.isArray(games)?games:[]}}catch(e){return {week,error:e instanceof Error?e.message:'Fetch failed',games:[] as Box[]}}});
 const results=await Promise.all(requests);const games=results.flatMap(r=>r.games).map(g=>({id:String(g.id),teams:g.teams.map(extract)}));const failures=results.filter(r=>r.error).map(r=>({week:r.week,error:r.error}));
 return NextResponse.json({season,source:'CollegeFootballData /games/teams',games,coverage:{weeksRequested:16,weeksFailed:failures.length,games:games.length,failures},notes:'Game box-score fields can be missing. Passing/rushing plays are a simple proxy for offensive plays, not an official play count. EPA, success rate and drives require a separate verified play-by-play or advanced-data feed; they are not inferred from these box scores.'});
}
