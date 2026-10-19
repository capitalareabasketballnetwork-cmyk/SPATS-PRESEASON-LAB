import {NextRequest,NextResponse} from 'next/server';
import {gunzipSync} from 'node:zlib';
export const runtime='nodejs';
export const maxDuration=60;
type Row=Record<string,string>;
type Game={game_id:string;season:number;week:number;date:string;home:string;away:string;homeScore:string;awayScore:string;homeRating?:number;awayRating?:number;edge:number;pick:string|null;confidence?:number|null;final:boolean};
let oddsCache:Promise<Row[]>|undefined;
const canon=(s:string)=>s==='WSH'?'WAS':s==='LAR'?'LA':s;
const num=(s:unknown)=>s===undefined||s===null||s===''?NaN:Number(s);
async function odds():Promise<Row[]>{
 if(!oddsCache)oddsCache=(async()=>{
 const response=await fetch('https://raw.githubusercontent.com/capitalareabasketballnetwork-cmyk/SPATS-NFL-MODEL/main/data/web/nfl_historical_odds.csv.gz',{next:{revalidate:3600}});
 if(!response.ok)throw Error('Historical odds data is unavailable');
 const lines=gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8').replace(/\r/g,'').trim().split('\n');
 const cols=lines.shift()!.split(',');
 return lines.map(line=>{const values=line.split(',');return Object.fromEntries(cols.map((k,i)=>[k,values[i]||'']))});
 })().catch(e=>{oddsCache=undefined;throw e});
 return oddsCache;
}
const mean=(arr:number[],fallback:number)=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:fallback;
const payout=(stake:number,price:number)=>price>0?stake*price/100:stake*100/Math.abs(price);
type Pick='home'|'away'|'over'|'under'|'push'|'none';
type Outcome='win'|'loss'|'push'|'pending'|'no line';
function settle(pick:Pick,actual:number,line:number,kind:'spread'|'total',stake:number,price:number){
 if(pick==='none'||!Number.isFinite(line)||!Number.isFinite(price)||price===0)return {outcome:'no line' as Outcome,profit:null};
 if(!Number.isFinite(actual))return {outcome:'pending' as Outcome,profit:null};
 const score=kind==='spread'?actual+line:actual-line;
 if(Math.abs(score)<.0001)return {outcome:'push' as Outcome,profit:0};
 const won=kind==='spread'?(pick==='home'?score>0:score<0):(pick==='over'?score>0:score<0);
 return {outcome:(won?'win':'loss') as Outcome,profit:won?payout(stake,price):-stake};
}
export async function POST(req:NextRequest){
 try{
 const body=await req.json();const stake=num(body.stake);
 if(!Number.isFinite(stake)||stake<=0||stake>1000000)return NextResponse.json({error:'Choose a valid unit amount.'},{status:400});
 const games=(body.games||[]) as Game[];
 if(games.length>7000)return NextResponse.json({error:'Too many games.'},{status:400});
 const lines=await odds();const byId=new Map(lines.map(o=>[o.game_id,o]));
 const byMatch=new Map(lines.map(o=>[o.season+'|'+o.week+'|'+canon(o.home_team)+'|'+canon(o.away_team),o]));
 const history=new Map<string,{scored:number;allowed:number}[]>();const training:{edge:number;margin:number}[]=[];
 const sorted=[...games].sort((a,b)=>a.season-b.season||a.week-b.week||(a.date||'').localeCompare(b.date||''));
 const results:any[]=[];
 // Every matchup in a week is projected before any results from that week enter history.
 for(let i=0;i<sorted.length;){
 const first=sorted[i];let j=i;while(j<sorted.length&&sorted[j].season===first.season&&sorted[j].week===first.week)j++;
 const batch=sorted.slice(i,j);
 for(const g of batch){
  const home=history.get(canon(g.home))||[],away=history.get(canon(g.away))||[];
  const homeFor=mean(home.slice(-8).map(x=>x.scored),22),homeAgainst=mean(home.slice(-8).map(x=>x.allowed),22);
  const awayFor=mean(away.slice(-8).map(x=>x.scored),22),awayAgainst=mean(away.slice(-8).map(x=>x.allowed),22);
  const rawHome=(homeFor+awayAgainst)/2+1.1,rawAway=(awayFor+homeAgainst)/2-1.1;
  const scoringMargin=rawHome-rawAway;
  // Fit an expanding, shrinkage-regularized linear margin calibration.
  const xbar=mean(training.map(t=>t.edge),0),ybar=mean(training.map(t=>t.margin),2.2);
  const cov=training.reduce((sum,t)=>sum+(t.edge-xbar)*(t.margin-ybar),0);
  const variance=training.reduce((sum,t)=>sum+(t.edge-xbar)**2,0);
  const slope=training.length>=60?Math.max(-1,Math.min(18,cov/(variance+30))):0;
  const calibrated=training.length>=60?Math.max(-24,Math.min(24,ybar+slope*(g.edge-xbar))):scoringMargin;
  const margin=(Number.isFinite(g.edge)&&Boolean(g.pick)&&training.length>=60)?(0.6*calibrated+0.4*scoringMargin):scoringMargin;
  const total=Math.max(20,Math.min(80,rawHome+rawAway));
  const homePoints=(total+margin)/2,awayPoints=(total-margin)/2;
  const o=byId.get(g.game_id)||byMatch.get(g.season+'|'+g.week+'|'+canon(g.home)+'|'+canon(g.away));
  const mlHome=num(o?.home_moneyline),mlAway=num(o?.away_moneyline),rawSpread=num(o?.spread_line),totalLine=num(o?.total_line);
  // nflverse spread_line stores the absolute spread; infer the home-side sign from moneyline favoritism.
  const homeSpread=Number.isFinite(rawSpread)&&Number.isFinite(mlHome)&&Number.isFinite(mlAway)&&mlHome!==mlAway?(mlHome<mlAway?-Math.abs(rawSpread):Math.abs(rawSpread)):NaN;
  const spreadPick:Pick=Number.isFinite(homeSpread)?margin+homeSpread>0?'home':margin+homeSpread<0?'away':'push':'none';
  const totalPick:Pick=Number.isFinite(totalLine)?total>totalLine?'over':total<totalLine?'under':'push':'none';
  const actualHome=num(g.homeScore),actualAway=num(g.awayScore);
  const actualMargin=g.final&&Number.isFinite(actualHome)&&Number.isFinite(actualAway)?actualHome-actualAway:NaN;
  const actualTotal=Number.isFinite(actualMargin)?actualHome+actualAway:NaN;
  const spreadPrice=spreadPick==='home'?num(o?.home_spread_odds):spreadPick==='away'?num(o?.away_spread_odds):NaN;
  const totalPrice=totalPick==='over'?num(o?.over_odds):totalPick==='under'?num(o?.under_odds):NaN;
  const spread=settle(spreadPick,actualMargin,homeSpread,'spread',stake,spreadPrice);
  const totals=settle(totalPick,actualTotal,totalLine,'total',stake,totalPrice);
  results.push({game_id:g.game_id,season:g.season,week:g.week,home:g.home,away:g.away,final:g.final,actualHome:g.homeScore,actualAway:g.awayScore,homePoints:Math.max(0,homePoints),awayPoints:Math.max(0,awayPoints),margin,total,homeSpread:Number.isFinite(homeSpread)?homeSpread:null,totalLine:Number.isFinite(totalLine)?totalLine:null,spreadPick,totalPick,spreadPrice:Number.isFinite(spreadPrice)?spreadPrice:null,totalPrice:Number.isFinite(totalPrice)?totalPrice:null,spreadOutcome:spread.outcome,spreadProfit:spread.profit,totalOutcome:totals.outcome,totalProfit:totals.profit});
 }
 for(const g of batch){
  const h=num(g.homeScore),a=num(g.awayScore);
  if(!g.final||!Number.isFinite(h)||!Number.isFinite(a))continue;
  for(const [team,scored,allowed] of [[canon(g.home),h,a],[canon(g.away),a,h]] as [string,number,number][]){
   const entries=history.get(team)||[];entries.push({scored,allowed});history.set(team,entries);
  }
  if(Number.isFinite(g.edge)&&g.pick)training.push({edge:g.edge,margin:h-a});
 }
 i=j;
 }
 const start=num(body.start),end=num(body.end);
 const selected=results.filter(r=>r.season>=start&&r.season<=end);
 const summary=(market:'spread'|'total')=>{
  const graded=selected.filter(r=>r[market+'Profit']!==null&&['win','loss','push'].includes(r[market+'Outcome']));
  const profit=graded.reduce((s,r)=>s+r[market+'Profit'],0);
  return {bets:graded.length,wins:graded.filter(r=>r[market+'Outcome']==='win').length,losses:graded.filter(r=>r[market+'Outcome']==='loss').length,pushes:graded.filter(r=>r[market+'Outcome']==='push').length,profit,risked:graded.length*stake,roi:graded.length?100*profit/(graded.length*stake):0};
 };
 return NextResponse.json({rows:selected,summary:{spread:summary('spread'),total:summary('total')},method:'Expanding pregame team scoring averages plus an expanding regularized model-edge margin calibration. No game outcome enters its own projection.'});
 }catch(e){return NextResponse.json({error:String(e)},{status:500})}
}
