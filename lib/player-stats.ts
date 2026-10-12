export type PlayerStats={pointsPerGame:number;assistsPerGame:number;fieldGoalPct:number;reboundsPerGame:number;stealsPerGame:number;turnoversPerGame:number;season:number};
const urlBase='https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/';
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
function number(v:unknown):number|null{if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v==='string'){const n=Number(v.replace(/[%,]/g,''));return Number.isFinite(n)?n:null}return null}
function extract(source:unknown,season:number):PlayerStats|null{
 const candidates:{values:Record<string,number>;rank:number}[]=[];
 function visit(node:unknown,depth:number){if(depth>7||!obj(node))return;
  const labels=Array.isArray(node.labels)?node.labels:Array.isArray(node.names)?node.names:null;
  const lists=[node.averages,node.stats,node.totals,node.values];
  if(labels){for(let kind=0;kind<lists.length;kind++){const entries=lists[kind];if(!Array.isArray(entries))continue;const values:Record<string,number>={};labels.forEach((k,i)=>{const key=String(k).replace(/[^a-z0-9%]/gi,'').toUpperCase();const val=number(entries[i]);if(key&&val!==null)values[key]=val});if(Object.keys(values).length)candidates.push({values,rank:kind===0?3:kind===1?2:1})}}
  for(const [key,value] of Object.entries(node)){if(key==='athlete'||key==='headshot'||key==='team')continue;if(Array.isArray(value))value.slice(0,30).forEach(x=>visit(x,depth+1));else if(obj(value))visit(value,depth+1)}
 }
 visit(source,0);
 const get=(v:Record<string,number>,...keys:string[])=>{for(const k of keys)if(v[k]!==undefined)return v[k];return null};
 for(const item of candidates.sort((a,b)=>b.rank-a.rank)){
  const v=item.values;const gp=get(v,'GP','G','GAMES');const pts=get(v,'PTS','PPG','POINTSPERGAME');const ast=get(v,'AST','APG','ASSISTSPERGAME');const reb=get(v,'REB','RPG','REBOUNDSPERGAME','TRB');const stl=get(v,'STL','SPG','STEALSPERGAME');const tov=get(v,'TO','TOV','TOPG','TURNOVERS');let fg=get(v,'FG%','FGPCT','FIELDGOALPCT','FGPERCENTAGE');
  if(fg===null&&v.FGM!==undefined&&v.FGA>0)fg=v.FGM/v.FGA;
  if(pts===null||ast===null||reb===null||stl===null||tov===null||fg===null)continue;
  // ESPN totals must be converted to per-game values. An explicit averages array already has per-game stats.
  const divisor=item.rank===1&&gp&&gp>0?gp:1;
  const fieldGoalPct=fg>1?fg/100:fg;
  if(fieldGoalPct<0||fieldGoalPct>1)return null;
  return {pointsPerGame:pts/divisor,assistsPerGame:ast/divisor,fieldGoalPct,reboundsPerGame:reb/divisor,stealsPerGame:stl/divisor,turnoversPerGame:tov/divisor,season};
 }
 return null;
}
export async function getPlayerStats(id:string):Promise<PlayerStats|null>{
 if(!/^\d{1,12}$/.test(id))return null;
 for(const season of [2026,2025,2024]){
  const address=urlBase+id+'/stats?season='+season+'&seasontype=2';
  try{const response=await fetch(address,{next:{revalidate:86400},signal:AbortSignal.timeout(7000)});if(!response.ok)continue;const parsed=extract(await response.json(),season);if(parsed)return parsed}catch{}
 }
 return null;
}
