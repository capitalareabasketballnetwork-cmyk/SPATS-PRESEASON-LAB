import {NextResponse} from 'next/server';
import {getPlayerStats} from '../../../lib/player-stats';
export const revalidate=86400;
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id')||'';
 if(!/^\d{1,12}$/.test(id))return NextResponse.json({error:'Invalid player ID'},{status:400});
 const base='https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/'+id;
 try{
 const [profile,stats,normalized]=await Promise.allSettled([fetch(base+'/overview',{next:{revalidate:86400}}).then(async r=>r.ok?r.json():null),fetch(base+'/stats?season=2026',{next:{revalidate:86400}}).then(async r=>r.ok?r.json():null),getPlayerStats(id)]);
 const overview=profile.status==='fulfilled'?profile.value:null;
 const statistics=stats.status==='fulfilled'?stats.value:null;
 return NextResponse.json({overview,statistics,normalizedStats:normalized.status==='fulfilled'?normalized.value:null,source:'ESPN athlete records',notice:'Historical team memberships and statistics are shown only when provided by the source.'});
 }catch{return NextResponse.json({overview:null,statistics:null})}
}
