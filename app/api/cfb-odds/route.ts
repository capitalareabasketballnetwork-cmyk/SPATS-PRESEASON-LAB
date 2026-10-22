import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
export const maxDuration=60;
type Line={provider?:string;spread?:number|null;overUnder?:number|null;homeMoneyline?:number|null;awayMoneyline?:number|null;spreadOpen?:number|null;overUnderOpen?:number|null};
type RecordLine={id:number;season:number;startDate:string;homeTeam:string;awayTeam:string;homeScore:number|null;awayScore:number|null;lines:Line[]};
const numeric=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?n:null;
export async function GET(req:NextRequest){
 const year=Number(req.nextUrl.searchParams.get('season'));
 if(!Number.isInteger(year)||year<2013||year>2026)return NextResponse.json({error:'CFBD historical betting lines cover 2013 onward.'},{status:400});
 const token=(process.env.CFBD_API_KEY||'').trim().replace(/^['\"]|['\"]$/g,'').trim();
 if(!token)return NextResponse.json({error:'CFBD_API_KEY is not configured on the server. Add a CollegeFootballData API key to Vercel environment variables to activate historical betting lines.',configured:false},{status:503});
 if(/[\r\n\x00-\x1f\x7f]/.test(token)||/\s/.test(token)||/^Bearer\s/i.test(token))return NextResponse.json({error:'The CFBD_API_KEY value contains invalid formatting. In Vercel, paste only the raw API key on one line (no Bearer prefix, quotes, spaces or line breaks), then redeploy.',configured:true},{status:503});
 try{
  const resp=await fetch('https://api.collegefootballdata.com/lines?year='+year,{headers:{Authorization:'Bearer '+token},next:{revalidate:86400},signal:AbortSignal.timeout(25000)});
  if(!resp.ok)return NextResponse.json({error:'CFBD betting-lines request failed ('+resp.status+'). Verify API key and permissions.'},{status:502});
  const raw=await resp.json() as RecordLine[];
  if(!Array.isArray(raw))throw Error('Unexpected CFBD response');
  const games=raw.map(g=>({id:String(g.id),season:g.season,date:g.startDate,home:g.homeTeam,away:g.awayTeam,homeScore:numeric(g.homeScore),awayScore:numeric(g.awayScore),lines:(g.lines||[]).map(l=>({provider:l.provider||'unknown',spread:numeric(l.spread),overUnder:numeric(l.overUnder),homeMoneyline:numeric(l.homeMoneyline),awayMoneyline:numeric(l.awayMoneyline),spreadOpen:numeric(l.spreadOpen),overUnderOpen:numeric(l.overUnderOpen)}))}));
  return NextResponse.json({source:'CollegeFootballData',season:year,games,coverage:{games:games.length,moneyline:games.filter(g=>g.lines.some(l=>l.homeMoneyline!==null&&l.awayMoneyline!==null)).length,spread:games.filter(g=>g.lines.some(l=>l.spread!==null)).length,total:games.filter(g=>g.lines.some(l=>l.overUnder!==null)).length},notes:'CFBD spread and totals may lack actual wager prices. Do not assume -110 without clearly labelling it as hypothetical.'});
 }catch(e){console.error('CFBD odds request failed:',e instanceof Error?e.name:'Unknown error');return NextResponse.json({error:'Could not retrieve CollegeFootballData odds. Check the Vercel server logs and verify the API key and permissions; no credentials are included in this message.'},{status:502})}
}
