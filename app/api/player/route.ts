import {NextResponse} from 'next/server';
export const revalidate=86400;
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id')||'';
 if(!/^\d{1,12}$/.test(id))return NextResponse.json({error:'Invalid player ID'},{status:400});
 const base='https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/athletes/'+id;
 try{
 const [profile,stats]=await Promise.allSettled([fetch(base+'/overview',{next:{revalidate:86400}}).then(async r=>r.ok?r.json():null),fetch(base+'/stats',{next:{revalidate:86400}}).then(async r=>r.ok?r.json():null)]);
 const overview=profile.status==='fulfilled'?profile.value:null;
 const statistics=stats.status==='fulfilled'?stats.value:null;
 return NextResponse.json({overview,statistics,source:'ESPN athlete records',notice:'Historical team memberships and statistics are shown only when provided by the source.'});
 }catch{return NextResponse.json({overview:null,statistics:null})}
}
