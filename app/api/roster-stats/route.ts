import {NextResponse} from 'next/server';
import {getPlayerStats} from '../../../lib/player-stats';
export const maxDuration=60;
export async function GET(req:Request){
 const raw=new URL(req.url).searchParams.get('ids')||'';
 const ids=[...new Set(raw.split(',').filter(x=>/^\\d{1,12}$/.test(x)))].slice(0,45);
 if(!ids.length)return NextResponse.json({stats:{}});
 const entries:[string,Awaited<ReturnType<typeof getPlayerStats>>][]=[];
 for(let i=0;i<ids.length;i+=8){
  const part=await Promise.all(ids.slice(i,i+8).map(async id=>[id,await getPlayerStats(id)] as [string,Awaited<ReturnType<typeof getPlayerStats>>]));
  entries.push(...part);
 }
 return NextResponse.json({stats:Object.fromEntries(entries),source:'ESPN player season statistics; last available complete season 2026 or earlier'});
}
