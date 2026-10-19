import {NextRequest,NextResponse} from 'next/server';
import {gunzipSync} from 'node:zlib';
export const runtime='nodejs';
export const maxDuration=60;
type Row=Record<string,string>;
type Data={team:Row[];games:Row[];stats:string[];seasons:number[]};
let cache:Promise<Data>|undefined;
const base='https://raw.githubusercontent.com/capitalareabasketballnetwork-cmyk/SPATS-NFL-MODEL/main/data/web/';
function csv(data:string):Row[]{const lines=data.replace(/\r/g,'').split('\n').filter(Boolean);if(!lines.length)return [];const columns=lines[0].split(',');return lines.slice(1).map(line=>{const parts=line.split(',');const out:Row={};columns.forEach((k,i)=>out[k]=parts[i]||'');return out})}
async function read(name:string){const response=await fetch(base+name,{next:{revalidate:3600}});if(!response.ok)throw Error('NFL dataset unavailable: '+name);return csv(gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8'))}
async function load():Promise<Data>{if(!cache)cache=(async()=>{const [team,games]=await Promise.all([read('model_lab_team_games.csv.gz'),read('model_lab_games.csv.gz')]);const exclude=new Set(['game_id','season','week','game_date','team','home_team','away_team','home_margin','home_score','away_score','result','location']);const stats=Object.keys(team[0]||{}).filter(k=>!exclude.has(k)&&team.some(r=>r[k]!==''&&Number.isFinite(Number(r[k]))));const seasons=[...new Set(games.map(g=>Number(g.season)).filter(Number.isFinite))].sort((a,b)=>a-b);return {team,games,stats,seasons}})().catch(e=>{cache=undefined;throw e});return cache}
function label(k:string){const known:Record<string,string>={point_differential_per_game:'Point Differential',epa_per_play:'Offensive EPA / Play',offensive_epa_per_play:'Offensive EPA / Play',def_success_rate:'Defensive Success Rate',defensive_success_rate:'Defensive Success Rate',third_down_conversion_rate:'3rd Down Conversion %',third_down_rate:'3rd Down Conversion %',yards_per_play:'Yards / Play',turnover_margin_per_game:'Turnover Margin',yards_per_game:'Yards / Game',time_of_possession_seconds:'Time of Possession',fourth_down_conversion_rate:'4th Down Conversion %',fourth_down_rate:'4th Down Conversion %',penalty_yards_per_game:'Penalty Yards / Game',penalties_per_game:'Penalties / Game'};const suffixes:Record<string,string>={_l3:' · Last 3',_l5:' · Last 5',_l8:' · Last 8',_ewm:' · Recent EWM'};const suffix=Object.keys(suffixes).find(s=>k.endsWith(s));const root=suffix?k.slice(0,-suffix.length):k;return (known[root]||root.replace(/_/g,' '))+(suffix?suffixes[suffix]:'')}
function direction(k:string){return /allowed|against|penalt|interception|sack_allowed|pressure_allowed|turnover_rate|^def_success_rate/.test(k)?-1:1}
const num=(x:string)=>x===''?NaN:Number(x);
const canon=(team:string)=>team==='WSH'?'WAS':team==='LAR'?'LA':team;
// Keep the live score cache short-lived; a resolved Promise must not freeze scores.
let scheduleCache2026:{until:number;value:Promise<any[]>}|undefined;
type ScheduleGame={game_id:string;season:number;week:number;date:string;home:string;away:string;homeScore:string;awayScore:string;winner:string|null;final:boolean};
function parsedEvent(event:any,week:number):ScheduleGame|null{
 const comp=event.competitions?.[0];const teams=comp?.competitors||[];
 const home=teams.find((x:any)=>x.homeAway==='home'),away=teams.find((x:any)=>x.homeAway==='away');
 if(!home||!away)return null;
 const status=comp?.status?.type||event.status?.type||{};
 const finished=status.completed===true||status.state==='post';
 const hs=home.score==null||home.score===''?NaN:Number(home.score),as=away.score==null||away.score===''?NaN:Number(away.score);
 const final=finished&&Number.isFinite(hs)&&Number.isFinite(as);
 return {game_id:String(event.id),season:2026,week,date:event.date,home:home.team.abbreviation,away:away.team.abbreviation,homeScore:final?String(hs):'',awayScore:final?String(as):'',winner:final&&hs!==as?(hs>as?home.team.abbreviation:away.team.abbreviation):null,final}
}
async function schedule2026(week:number){
 const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week='+week+'&limit=100';
 const res=await fetch(url,{next:{revalidate:120}});if(!res.ok)throw Error('2026 schedule unavailable');
 const json=await res.json();const games:ScheduleGame[]=(json.events||[]).map((e:any)=>parsedEvent(e,week)).filter(Boolean);
 // ESPN scoreboard can leave an individual completed game's status stale.
 // Check its dedicated event summary rather than marking the game pending.
 const now=Date.now();
 await Promise.all(games.map(async (game,i)=>{
   if(game.final||!game.date||new Date(game.date).getTime()+5*60*60*1000>now)return;
   try{
     const detail=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+encodeURIComponent(game.game_id),{next:{revalidate:120}});
     if(!detail.ok)return;
     const data=await detail.json();const competition=data.header?.competitions?.[0];
     const resolved=parsedEvent({id:game.game_id,date:game.date,competitions:[competition],status:competition?.status},week);
     if(resolved?.final)games[i]=resolved;
   }catch{}
 }));
 return games;
}
async function fullSchedule2026(){if(!scheduleCache2026||Date.now()>scheduleCache2026.until){
 const value=Promise.all(Array.from({length:18},(_,i)=>schedule2026(i+1))).then(x=>x.flat()).catch(e=>{scheduleCache2026=undefined;throw e});
 scheduleCache2026={until:Date.now()+120000,value};
 }return scheduleCache2026.value}
function fillRepoScores(games:ScheduleGame[],rows:Row[]):ScheduleGame[]{
 const known=new Map<string,Row>();
 for(const row of rows){if(Number(row.season)!==2026)continue;
  known.set(row.week+'|'+canon(row.away_team)+'|'+canon(row.home_team),row)}
 return games.map(g=>{
  if(g.final)return g;
  const match=known.get(g.week+'|'+canon(g.away)+'|'+canon(g.home));
  if(!match)return g;
  const hs=num(match.home_score),as=num(match.away_score);
  // A recorded score pair is a completed game only if a final margin is present.
  const margin=num(match.home_margin);
  if(!Number.isFinite(hs)||!Number.isFinite(as)||!Number.isFinite(margin))return g;
  return {...g,homeScore:String(hs),awayScore:String(as),winner:hs===as?null:hs>as?g.home:g.away,final:true};
 });
}
export async function GET(req:NextRequest){try{const week=Number(req.nextUrl.searchParams.get('week'));if(req.nextUrl.searchParams.get('season')==='2026'&&Number.isInteger(week)&&week>=1&&week<=18){const [games,d]=await Promise.all([schedule2026(week),load()]);return NextResponse.json({schedule:fillRepoScores(games,d.games)})}const d=await load();return NextResponse.json({stats:d.stats.map(k=>({key:k,label:label(k),direction:direction(k),common:/point_differential|epa_per_play|def_success_rate|third_down|yards_per_play|turnover_margin|yards_per_game|time_of_possession|fourth_down|penalty/.test(k)})),seasons:d.seasons,games:d.games.length,teamRows:d.team.length})}catch(e){return NextResponse.json({error:String(e)},{status:500})}}
export async function POST(req:NextRequest){try{
 const payload=await req.json();const d=await load();const active=(payload.weights||{}) as Record<string,number>;
 const keys=Object.keys(active).filter(k=>d.stats.includes(k)&&Number(active[k])>0);
 if(!keys.length)return NextResponse.json({error:'Choose at least one available statistic.'},{status:400});
 const weightTotal=keys.reduce((sum,k)=>sum+Number(active[k]),0);
 const start=Number(payload.start||d.seasons[0]),end=Number(payload.end||d.seasons[d.seasons.length-1]);
 // Include earlier completed games only to calibrate each pick without seeing its outcome.
 const calibrationStart=Math.min(start,2015);

 // Index team-game observations. A prediction no longer depends on a row existing
 // for the game being predicted: it is built from that team's PRIOR rows.
 const byTeam=new Map<string,Map<number,Row[]>>();
 for(const row of d.team){const team=canon(row.team);const season=Number(row.season);let seasons=byTeam.get(team);if(!seasons){seasons=new Map();byTeam.set(team,seasons)}const arr=seasons.get(season)||[];arr.push(row);seasons.set(season,arr)}
 for(const seasons of byTeam.values())for(const arr of seasons.values())arr.sort((a,b)=>(a.game_date||'').localeCompare(b.game_date||'')||Number(a.week)-Number(b.week));

 const gameRows:any[]=d.games.filter(g=>num(g.season)>=calibrationStart&&num(g.season)<=end).map(g=>({
   game_id:g.game_id,season:Number(g.season),week:Number(g.week),date:g.game_date,
   home:g.home_team,away:g.away_team,homeScore:g.home_score,awayScore:g.away_score,
   margin:num(g.home_margin),final:Number.isFinite(num(g.home_margin))
 }));
 // The permanent repository export can lag the live season. For 2026, use the
 // complete schedule, while model features still come only from repository team data.
 if(start<=2026&&end>=2026){const live=fillRepoScores(await fullSchedule2026(),d.games);const historical=gameRows.filter(g=>g.season!==2026);gameRows.length=0;gameRows.push(...historical,...live.map((g:any)=>({game_id:g.game_id,season:2026,week:g.week,date:g.date,home:g.home,away:g.away,homeScore:g.homeScore,awayScore:g.awayScore,margin:g.final?(Number(g.homeScore)-Number(g.awayScore)):NaN,final:g.final})))}

 const priorValues=(teamRaw:string,season:number,week:number,date:string)=>{
   const seasons=byTeam.get(canon(teamRaw));if(!seasons)return null;
   const currentRows=(seasons.get(season)||[]).filter(r=>{
     if(date&&r.game_date)return r.game_date<date;
     return Number(r.week)<week;
   });
   const previousRows=seasons.get(season-1)||[];
   const previousWeight=Math.max(0,Math.min(1,(5-week)/4)); // W1 100%, W2 75%, W3 50%, W4 25%, W5+ 0
   const values:Record<string,number>={};
   for(const k of keys){
     const rolling=/(_l3|_l5|_l8|_ewm)$/.test(k);
     const currentValid=currentRows.map(r=>num(r[k])).filter(Number.isFinite);
     const previousValid=previousRows.map(r=>num(r[k])).filter(Number.isFinite);
     const current=rolling?(currentValid.length?currentValid[currentValid.length-1]:NaN):(currentValid.length?currentValid.reduce((a,b)=>a+b,0)/currentValid.length:NaN);
     const previous=rolling?(previousValid.length?previousValid[previousValid.length-1]:NaN):(previousValid.length?previousValid.reduce((a,b)=>a+b,0)/previousValid.length:NaN);
     if(previousWeight>0&&Number.isFinite(previous))values[k]=Number.isFinite(current)?previousWeight*previous+(1-previousWeight)*current:previous;
     else if(Number.isFinite(current))values[k]=current;
     else if(Number.isFinite(previous))values[k]=previous; // data-gap fallback, never future data
     else return null;
   }
   return values;
 };

 type Entry={game:any;side:'home'|'away';team:string;values:Record<string,number>};
 const buckets=new Map<string,Entry[]>();
 for(const game of gameRows){const bucket=game.season+'|'+game.week;const list=buckets.get(bucket)||[];
   const hv=priorValues(game.home,game.season,game.week,game.date);const av=priorValues(game.away,game.season,game.week,game.date);
   if(hv)list.push({game,side:'home',team:game.home,values:hv});if(av)list.push({game,side:'away',team:game.away,values:av});buckets.set(bucket,list)
 }
 const ratings=new Map<string,number>();
 for(const entries of buckets.values()){
   const moments:Record<string,{mean:number;sd:number}>={};
   for(const k of keys){const vals=entries.map(e=>e.values[k]).filter(Number.isFinite);const mean=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:NaN;const sd=vals.length?Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length):NaN;moments[k]={mean,sd}}
   for(const e of entries){let rating=0;let complete=true;for(const k of keys){const x=e.values[k],m=moments[k];if(!Number.isFinite(x)||!Number.isFinite(m.mean)||!Number.isFinite(m.sd)){complete=false;break}rating+=(m.sd>0?(x-m.mean)/m.sd:0)*direction(k)*Number(active[k])/weightTotal}if(complete)ratings.set(e.game.game_id+'|'+e.side,rating)}
 }
 const rows=gameRows.map(g=>{const home=ratings.get(g.game_id+'|home'),away=ratings.get(g.game_id+'|away');const rated=home!==undefined&&away!==undefined;const edge=rated?home-away:0;const pick=rated?(edge>=0?g.home:g.away):null;const winner=Number.isFinite(g.margin)&&g.margin!==0?(g.margin>0?g.home:g.away):null;return {game_id:g.game_id,season:g.season,week:g.week,date:g.date,home:g.home,away:g.away,homeScore:g.homeScore,awayScore:g.awayScore,final:g.final===true,homeRating:home,awayRating:away,edge,pick,winner,correct:winner&&pick?canon(pick)===canon(winner):null}});
 // Pre-game confidence calibration: use only older completed predictions from this
 // same model, and weight observations with similar absolute rating edges.
 // The 30 pseudo-games at 50% dampen small-sample overconfidence.
 const past:{edge:number;correct:boolean}[]=[];
 const calibrated=rows.slice().sort((a,b)=>a.season-b.season||a.week-b.week||(a.date||'').localeCompare(b.date||'')).map(g=>{
   let confidence:number|null=null;
   if(g.pick&&past.length>=60){
     const magnitude=Math.abs(g.edge);let sample=0,wins=0;
     for(const h of past){const weight=Math.exp(-Math.abs(h.edge-magnitude)/0.4);sample+=weight;if(h.correct)wins+=weight}
     if(sample>=10)confidence=Math.round(1000*(wins+15)/(sample+30))/10;
   }
   if(g.correct!==null&&g.pick)past.push({edge:Math.abs(g.edge),correct:g.correct});
   return {...g,confidence};
 });
 const visible=calibrated.filter(g=>g.season>=start&&g.season<=end);
 const finished=visible.filter(x=>x.correct!==null);
 const seasonList=Array.from(new Set(visible.map(x=>x.season))).sort((a,b)=>a-b).map(season=>{const games=finished.filter(x=>x.season===season);return {season,games:games.length,wins:games.filter(x=>x.correct).length,accuracy:games.length?100*games.filter(x=>x.correct).length/games.length:0}});
 return NextResponse.json({games:visible,summary:seasonList,record:{games:finished.length,wins:finished.filter(x=>x.correct).length,accuracy:finished.length?100*finished.filter(x=>x.correct).length/finished.length:0},stats:keys});
 }catch(e){return NextResponse.json({error:String(e)},{status:500})}}