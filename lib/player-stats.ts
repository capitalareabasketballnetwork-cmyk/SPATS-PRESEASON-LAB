export type PlayerStats={pointsPerGame:number;assistsPerGame:number;fieldGoalPct:number;reboundsPerGame:number;stealsPerGame:number;turnoversPerGame:number;season:number};
const urlBase='https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/';
type RecordValue=Record<string,unknown>;
const isRecord=(v:unknown):v is RecordValue=>!!v&&typeof v==='object'&&!Array.isArray(v);
const numeric=(v:unknown):number|null=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v==='string'&&v.trim()!==''){const n=Number(v.replace(/[%,]/g,''));return Number.isFinite(n)?n:null}return null};
const key=(s:string)=>s.replace(/[^a-z0-9]/gi,'').toUpperCase();
type Row={data:Record<string,number>;kind:'average'|'total'};
function extract(source:unknown,season:number):PlayerStats|null{
 const rows:Row[]=[];
 function walk(node:unknown,depth:number,context:string){
  if(depth>8||!isRecord(node))return;
  const labels=Array.isArray(node.labels)?node.labels:Array.isArray(node.names)?node.names:null;
  if(labels){
   for(const field of ['averages','stats','totals','values'] as const){
    const vals=node[field];if(!Array.isArray(vals)||vals.length!==labels.length)continue;
    // Raw totals and generically named values may contain season sums; never guess their units.
    // Only explicit season averages, or clearly labeled rate columns, are accepted.
    const averageContext=/average|pergame|per_game/i.test(context+' '+String(node.name||'')+' '+String(node.displayName||''));
    const explicitRate=labels.some(label=>/^(PPG|APG|RPG|SPG|TOPG|AVGPOINTS)$/i.test(String(label)));
    if(field!=='averages'&&!averageContext&&!explicitRate)continue;
    const data:Record<string,number>={};labels.forEach((label,i)=>{const n=numeric(vals[i]);if(n!==null)data[key(String(label))]=n});
    rows.push({data,kind:'average'});
   }
  }
  // ESPN sometimes supplies separate named statistic objects instead of parallel arrays.
  if(typeof node.name==='string'){
   const n=numeric(node.value??node.displayValue);
   if(n!==null&&/^avg|pergame/i.test(node.name)){
    const entry=rows.find(r=>r.kind==='average'&&r.data.__NAMED===1)||{data:{__NAMED:1},kind:'average' as const};
    entry.data[key(node.name)]=n;if(!rows.includes(entry))rows.push(entry);
   }
  }
  for(const [field,value] of Object.entries(node)){
   if(['athlete','headshot','team','competitors'].includes(field))continue;
   if(Array.isArray(value))value.slice(0,50).forEach(v=>walk(v,depth+1,context+' '+field));
   else if(isRecord(value))walk(value,depth+1,context+' '+field);
  }
 }
 walk(source,0,'');
 const get=(data:Record<string,number>,...names:string[])=>{for(const name of names){const n=data[name];if(Number.isFinite(n))return n}return null};
 for(const {data} of rows){
  const pts=get(data,'AVGPOINTS','POINTSPERGAME','PPG','PTS');
  const ast=get(data,'AVGASSISTS','ASSISTSPERGAME','APG','AST');
  const reb=get(data,'AVGREBOUNDS','REBOUNDSPERGAME','RPG','REB','TRB');
  const stl=get(data,'AVGSTEALS','STEALSPERGAME','SPG','STL');
  const tov=get(data,'AVGTURNOVERS','TURNOVERSPERGAME','TOPG','TO','TOV');
  let fg=get(data,'FIELDGOALPCT','FGPCT','FGPERCENTAGE','FG');
  if(fg===null&&data.FGM!==undefined&&data.FGA>0)fg=data.FGM/data.FGA;
  if([pts,ast,reb,stl,tov,fg].some(n=>n===null))continue;
  const percentage=(fg as number)>1?(fg as number)/100:fg as number;
  if(percentage<0||percentage>1||[pts,ast,reb,stl,tov].some(n=>(n as number)<0))continue;
  // Reject rows with impossible averages rather than publish mislabeled values.
  if((pts as number)>65||(ast as number)>25||(reb as number)>35||(stl as number)>12||(tov as number)>20)continue;
  return {pointsPerGame:pts as number,assistsPerGame:ast as number,reboundsPerGame:reb as number,stealsPerGame:stl as number,turnoversPerGame:tov as number,fieldGoalPct:percentage,season};
 }
 return null;
}
export async function getPlayerStats(id:string):Promise<PlayerStats|null>{
 if(!/^\d{1,12}$/.test(id))return null;
 for(const season of [2026,2025,2024]){
  try{
   const response=await fetch(urlBase+id+'/stats?season='+season+'&seasontype=2',{next:{revalidate:3600},signal:AbortSignal.timeout(7000)});
   if(!response.ok)continue;
   const parsed=extract(await response.json(),season);
   if(parsed)return parsed;
  }catch{}
 }
 return null;
}
