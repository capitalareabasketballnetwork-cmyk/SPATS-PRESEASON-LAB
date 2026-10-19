import {NextResponse} from 'next/server';
import {gunzipSync} from 'node:zlib';
export const runtime='nodejs';
export async function GET(){
 try{
  const url='https://raw.githubusercontent.com/capitalareabasketballnetwork-cmyk/SPATS-NFL-MODEL/main/data/web/nfl_historical_odds.csv.gz';
  const response=await fetch(url,{next:{revalidate:3600}});
  if(!response.ok)throw Error('Historical odds file unavailable');
  const raw=gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
  const lines=raw.trim().split(/\r?\n/),keys=lines.shift()!.split(',');
  const wanted=['game_id','season','week','home_team','away_team','home_moneyline','away_moneyline'];
  const indices=wanted.map(k=>keys.indexOf(k));
  if(indices.some(i=>i<0))throw Error('Historical odds schema changed');
  const games=lines.map(line=>{const parts=line.split(',');return Object.fromEntries(wanted.map((k,i)=>[k,parts[indices[i]]||'']))}).filter(g=>Number(g.season)>=2015);
  return NextResponse.json({games});
 }catch(e){return NextResponse.json({error:String(e)},{status:500})}
}
