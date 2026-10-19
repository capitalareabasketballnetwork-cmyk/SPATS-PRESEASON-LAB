import {NextResponse} from 'next/server';
import {gunzipSync} from 'node:zlib';
export const runtime='nodejs';
export const maxDuration=60;
type Row=Record<string,string>;
type Match={features:number[];homeWon:boolean;season:number};
const root='https://raw.githubusercontent.com/capitalareabasketballnetwork-cmyk/SPATS-NFL-MODEL/main/data/web/';
const number=(s:unknown)=>s===null||s===undefined||s===''?NaN:Number(s);
const canon=(s:string)=>s==='WSH'?'WAS':s==='LAR'?'LA':s;
const direction=(k:string)=>/allowed|against|penalt|interception|sack_allowed|pressure_allowed|turnover_rate|^def_success_rate/.test(k)?-1:1;
function parse(text:string):Row[]{const lines=text.replace(/\r/g,'').trim().split('\n');const headers=lines.shift()!.split(',');return lines.map(line=>{const cols=line.split(',');return Object.fromEntries(headers.map((k,i)=>[k,cols[i]||'']))})}
async function get(file:string){const res=await fetch(root+file,{next:{revalidate:3600}});if(!res.ok)throw Error('Could not read '+file);return parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8'))}
const wanted=['point_differential_per_game','epa_per_play','offensive_epa_per_play','def_success_rate','defensive_success_rate','yards_per_play','turnover_margin_per_game','third_down_conversion_rate','third_down_rate','yards_per_game','time_of_possession_seconds','fourth_down_conversion_rate','fourth_down_rate','penalty_yards_per_game','penalties_per_game','offensive_success_rate','defensive_epa_per_play','offensive_points_per_game','points_per_game','red_zone_td_rate','sacks_per_game','explosive_play_rate','pass_epa_per_play','rush_epa_per_play'];
let prepared:Promise<{keys:string[];matches:Match[]}>|undefined;
async function prepare(){
 if(!prepared)prepared=(async()=>{
 const [teams,games]=await Promise.all([get('model_lab_team_games.csv.gz'),get('model_lab_games.csv.gz')]);
 const available=new Set(Object.keys(teams[0]||{}));
 const keys=wanted.filter(k=>available.has(k)&&teams.some(r=>Number.isFinite(number(r[k])))).slice(0,20);
 if(keys.length<4)throw Error('Not enough usable NFL statistics to optimize');
 const byTeam=new Map<string,Map<number,Row[]>>();
 for(const r of teams){const team=canon(r.team),season=Number(r.season);if(season<2017||season>2025)continue;let seasons=byTeam.get(team);if(!seasons){seasons=new Map();byTeam.set(team,seasons)}const arr=seasons.get(season)||[];arr.push(r);seasons.set(season,arr)}
 for(const seasons of byTeam.values())for(const rows of seasons.values())rows.sort((a,b)=>(a.game_date||'').localeCompare(b.game_date||'')||Number(a.week)-Number(b.week));
 const seasonGames=games.filter(g=>Number(g.season)>=2018&&Number(g.season)<=2025&&Number.isFinite(number(g.home_margin))&&number(g.home_margin)!==0);
 type Observation={id:string;side:'home'|'away';values:number[]};
 const bucket=new Map<string,Observation[]>();
 const prior=(team:string,season:number,week:number,date:string)=>{
  const seasons=byTeam.get(canon(team));if(!seasons)return keys.map(()=>NaN);
  const current=(seasons.get(season)||[]).filter(r=>date&&r.game_date?r.game_date<date:Number(r.week)<week);
  const previous=seasons.get(season-1)||[];
  const carry=Math.max(0,Math.min(1,(5-week)/4));
  return keys.map(k=>{
   const rolling=/(_l3|_l5|_l8|_ewm)$/.test(k);
   const curr=current.map(r=>number(r[k])).filter(Number.isFinite);
   const prev=previous.map(r=>number(r[k])).filter(Number.isFinite);
   const c=rolling?curr.at(-1)??NaN:curr.length?curr.reduce((a,b)=>a+b,0)/curr.length:NaN;
   const p=rolling?prev.at(-1)??NaN:prev.length?prev.reduce((a,b)=>a+b,0)/prev.length:NaN;
   if(carry>0&&Number.isFinite(p))return Number.isFinite(c)?carry*p+(1-carry)*c:p;
   return Number.isFinite(c)?c:p;
  });
 };
 for(const g of seasonGames){const season=Number(g.season),week=Number(g.week),bucketKey=season+'|'+week;
  const arr=bucket.get(bucketKey)||[];arr.push({id:g.game_id,side:'home',values:prior(g.home_team,season,week,g.game_date)});arr.push({id:g.game_id,side:'away',values:prior(g.away_team,season,week,g.game_date)});bucket.set(bucketKey,arr);
 }
 const normalized=new Map<string,number[]>();
 for(const obs of bucket.values()){
  const means=keys.map((_,i)=>{const vals=obs.map(o=>o.values[i]).filter(Number.isFinite);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:NaN});
  const sds=keys.map((_,i)=>{const vals=obs.map(o=>o.values[i]).filter(Number.isFinite);return vals.length?Math.sqrt(vals.reduce((a,b)=>a+(b-means[i])**2,0)/vals.length):NaN});
  for(const o of obs)normalized.set(o.id+'|'+o.side,o.values.map((v,i)=>Number.isFinite(v)&&Number.isFinite(means[i])&&Number.isFinite(sds[i])?(sds[i]>0?(v-means[i])/sds[i]:0)*direction(keys[i]):NaN));
 }
 const matches:Match[]=[];
 for(const g of seasonGames){const h=normalized.get(g.game_id+'|home'),a=normalized.get(g.game_id+'|away');if(!h||!a)continue;
  matches.push({features:keys.map((_,i)=>Number.isFinite(h[i])&&Number.isFinite(a[i])?h[i]-a[i]:NaN),homeWon:number(g.home_margin)>0,season:Number(g.season)});
 }
 return {keys,matches};
 })().catch(e=>{prepared=undefined;throw e});
 return prepared;
}
type Candidate={weights:number[];train:number;validation:number;test:number;trainGames:number;validationGames:number;testGames:number;trainWins:number;validationWins:number;testWins:number};
function evaluate(weights:number[],matches:Match[]):Candidate{
 let tr=0,tw=0,va=0,vw=0,te=0,ew=0;
 for(const m of matches){let edge=0,valid=true;
  for(let i=0;i<weights.length;i++){if(weights[i]<=0)continue;if(!Number.isFinite(m.features[i])){valid=false;break}edge+=weights[i]*m.features[i]}
  if(!valid)continue;
  const win=(edge>=0)===m.homeWon;
  if(m.season<=2022){tr++;if(win)tw++}else if(m.season<=2024){va++;if(win)vw++}else{te++;if(win)ew++}
 }
 return {weights,train:tr?100*tw/tr:0,validation:va?100*vw/va:0,test:te?100*ew/te:0,trainGames:tr,validationGames:va,testGames:te,trainWins:tw,validationWins:vw,testWins:ew};
}
function randomWeights(n:number):number[]{
 const out=Array(n).fill(0),count=3+Math.floor(Math.random()*Math.min(7,n-2));
 const order=Array.from({length:n},(_,i)=>i).sort(()=>Math.random()-.5).slice(0,count);
 let sum=0;for(const i of order){out[i]=Math.pow(Math.random(),1.6)+.03;sum+=out[i]}return out.map(v=>v/sum);
}
function mutate(source:number[]):number[]{
 const w=[...source],n=w.length;
 const i=Math.floor(Math.random()*n),j=Math.floor(Math.random()*n);
 if(Math.random()<.28){w[i]=w[i]>0?0:Math.random()*.5+.05}
 else{w[i]=Math.max(0,w[i]+(Math.random()-.5)*.5);if(Math.random()<.5)w[j]=Math.max(0,w[j]+(Math.random()-.5)*.4)}
 let sum=w.reduce((a,b)=>a+b,0);if(!sum)return randomWeights(n);return w.map(v=>v/sum);
}
export async function POST(){
 try{
 const {keys,matches}=await prepare();const train=matches.filter(m=>m.season<=2022);
 const validation=matches.filter(m=>m.season>=2023&&m.season<=2024);
 const test=matches.filter(m=>m.season===2025);
 if(train.length<400||validation.length<150||test.length<100)throw Error('Insufficient training, validation or holdout games.');
 const pool:Candidate[]=[];let bestTrain=-1;let seed:number[]|null=null;
 // Search the combinatorial space with randomized starts and local perturbations.
 // A finite search cannot exhaust every possible continuous weight combination.
 for(let t=0;t<3500;t++){
  const w=t%6===0||!seed?randomWeights(keys.length):mutate(seed);
  const c=evaluate(w,train);
  if(c.trainGames<train.length*.72)continue;
  if(c.train>bestTrain||t%100===0){bestTrain=Math.max(bestTrain,c.train);seed=w}
  pool.push(c);
 }
 const shortlist=pool.sort((a,b)=>b.train-a.train).slice(0,240);
 const finalists=shortlist.map(c=>evaluate(c.weights,matches)).filter(c=>c.validationGames>=validation.length*.72&&c.testGames>=test.length*.72).sort((a,b)=>b.validation-a.validation||b.train-a.train);
 const top:Candidate[]=[];
 for(const c of finalists){if(top.every(other=>c.weights.reduce((sum,w,i)=>sum+Math.abs(w-other.weights[i]),0)>.35))top.push(c);if(top.length===5)break}
 // If accuracy ties are common, still return five different candidates.
 if(top.length<5)for(const c of finalists){if(top.every(other=>c.weights.reduce((sum,w,i)=>sum+Math.abs(w-other.weights[i]),0)>.12))top.push(c);if(top.length===5)break}
 return NextResponse.json({models:top.map((c,i)=>({name:'AI Candidate '+(i+1),weights:Object.fromEntries(keys.map((k,j)=>[k,Number(c.weights[j].toFixed(5))]).filter(([,w])=>w>0)),train:{wins:c.trainWins,games:c.trainGames,accuracy:c.train},validation:{wins:c.validationWins,games:c.validationGames,accuracy:c.validation},holdout:{wins:c.testWins,games:c.testGames,accuracy:c.test}})),evaluated:pool.length,statsConsidered:keys.length,method:'Randomized search with local weight mutations. Train 2018–2022, select by 2023–2024 validation accuracy, report untouched 2025 holdout. No future-game stats used.'});
 }catch(e){return NextResponse.json({error:String(e)},{status:500})}
}
