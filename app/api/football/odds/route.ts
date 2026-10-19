import {NextRequest,NextResponse} from 'next/server';
import {gunzipSync} from 'node:zlib';
export const runtime='nodejs';
export const maxDuration=60;
type Row=Record<string,string>;
let cache:Promise<Row[]>|undefined;
const source='https://raw.githubusercontent.com/capitalareabasketballnetwork-cmyk/SPATS-NFL-MODEL/main/data/web/nfl_historical_odds.csv.gz';
const canon=(team:string)=>team==='WSH'?'WAS':team==='LAR'?'LA':team;
function csv(data:string):Row[]{const lines=data.replace(/\r/g,'').split('\n').filter(Boolean);if(!lines.length)return[];const cols=lines[0].split(',');return lines.slice(1).map(line=>{const values=line.split(',');return Object.fromEntries(cols.map((c,i)=>[c,values[i]||'']))})}
async function odds(){if(!cache)cache=fetch(source,{next:{revalidate:3600}}).then(async r=>{if(!r.ok)throw Error('Historical odds dataset unavailable.');return csv(gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8'))}).catch(e=>{cache=undefined;throw e});return cache}
const n=(x:string)=>x===''?null:Number(x);
const payout=(stake:number,american:number)=>american>0?stake*american/100:stake*100/Math.abs(american);
export async function POST(req:NextRequest){try{
 const body=await req.json();const stake=Math.max(0,Number(body.stake)||0),start=Number(body.start),end=Number(body.end);
 const predictions=(body.games||[]) as any[];const data=await odds();
 const exact=new Map(data.map(o=>[o.game_id,o]));
 const matchup=new Map(data.map(o=>[o.season+'|'+o.week+'|'+canon(o.away_team)+'|'+canon(o.home_team),o]));
 const rows=predictions.filter(g=>g.season>=start&&g.season<=end&&g.pick&&(g.final===true||g.winner)).map(g=>{
   const o=exact.get(g.game_id)||matchup.get(g.season+'|'+g.week+'|'+canon(g.away)+'|'+canon(g.home));
   if(!o)return {...g,odds:null,profit:null,totalReturn:null,reason:'No historical odds'};
   const pickHome=canon(g.pick)===canon(g.home);const price=n(pickHome?o.home_moneyline:o.away_moneyline);
   if(price===null||!Number.isFinite(price))return {...g,odds:null,profit:null,totalReturn:null,reason:'No moneyline'};
   const tie=g.final===true&&!g.winner;const correct=g.correct===true;const profit=tie?0:correct?payout(stake,price):-stake;
   return {...g,odds:price,profit,totalReturn:tie?stake:correct?stake+profit:0,reason:null,tie};
 });
 const graded=rows.filter(r=>r.profit!==null);const profit=graded.reduce((a,r)=>a+r.profit,0);const risked=graded.length*stake;
 return NextResponse.json({rows,summary:{bets:graded.length,wins:graded.filter(r=>r.correct===true).length,losses:graded.filter(r=>r.correct===false).length,ties:graded.filter(r=>r.tie===true).length,profit,risked,ending:risked+profit,roi:risked?profit/risked*100:0,missing:rows.length-graded.length}});
 }catch(e){return NextResponse.json({error:String(e)},{status:500})}}
