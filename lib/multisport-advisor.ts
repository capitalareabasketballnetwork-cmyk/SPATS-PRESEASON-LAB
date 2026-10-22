import {backtest,initialWeights,metrics,normalizeWeights,type Game,type WeightMap} from './multisport-model';
export type AdvisorResult={name:string;weights:WeightMap;accuracy:number;games:number;holdout:number;wins:number;trainingAccuracy:number;holdoutAccuracy:number;holdoutWins:number;holdoutGames:number};
const candidateModels=()=>{
 const list:Array<{name:string;weights:WeightMap}>=[{name:'Balanced',weights:initialWeights}];
 const add=(name:string,raw:WeightMap)=>list.push({name,weights:normalizeWeights(raw)});
 for(const m of metrics)add(m.label,{[m.key]:1});
 for(let i=0;i<metrics.length;i++)for(let j=i+1;j<metrics.length;j++)for(const ratio of [[1,1],[2,1],[1,2]])add(metrics[i].label+' + '+metrics[j].label+' ('+ratio.join(':')+')',{[metrics[i].key]:ratio[0],[metrics[j].key]:ratio[1]});
 // Broaden the search beyond pairs: balanced and emphasized three-stat models.
 const shortlist=['win_pct','point_margin','points_for','points_against','recent_win_pct','recent_margin','home_win_pct','away_win_pct','scoring_consistency','defensive_consistency','home_margin','away_margin'] as const;
 for(let i=0;i<shortlist.length;i++)for(let j=i+1;j<shortlist.length;j++)for(let k=j+1;k<shortlist.length;k++){
  const keys=[shortlist[i],shortlist[j],shortlist[k]];
  for(const ratio of [[1,1,1],[2,1,1],[1,2,1],[1,1,2]])add('Triple: '+keys.join(' / ')+' ('+ratio.join(':')+')',Object.fromEntries(keys.map((key,n)=>[key,ratio[n]])) as WeightMap);
 }
 // Deterministic sparse search: reproducible runs and no reliance on lucky random seeds.
 let seed=734219;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let n=0;n<400;n++){
  const count=3+Math.floor(rand()*5),order=[...metrics.map(m=>m.key)];
  for(let i=order.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
  const raw={} as WeightMap;for(const key of order.slice(0,count))raw[key]=Math.pow(rand(),1.5)+.05;
  add('Deep search '+(n+1),raw);
 }
 return list;
};
export function rankAdvisorModels(games:Game[]):{top:AdvisorResult[];tested:number;training:number;validation:number;holdout:number;warning:string}{
 const finals=games.filter(g=>g.final&&g.homeScore!==null&&g.awayScore!==null&&g.homeScore!==g.awayScore).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 if(finals.length<60)return {top:[],tested:0,training:0,validation:0,holdout:0,warning:'At least 60 completed games are required across the available seasons.'};
 const trainEnd=finals[Math.floor(finals.length*.6)]?.date||'',validationEnd=finals[Math.floor(finals.length*.8)]?.date||'';
 const candidates=candidateModels(),ranked:AdvisorResult[]=[];
 for(const c of candidates){
  const predictions=backtest(games,c.weights).filter(p=>p.correct!==null);
  const training=predictions.filter(p=>p.date<trainEnd),validation=predictions.filter(p=>p.date>=trainEnd&&p.date<validationEnd),holdout=predictions.filter(p=>p.date>=validationEnd);
  if(training.length<20||validation.length<10||holdout.length<10)continue;
  const wins=validation.filter(p=>p.correct===true).length,holdoutWins=holdout.filter(p=>p.correct===true).length;
  ranked.push({name:c.name,weights:c.weights,accuracy:100*wins/validation.length,games:predictions.length,holdout:validation.length,wins,trainingAccuracy:100*training.filter(p=>p.correct===true).length/training.length,holdoutAccuracy:100*holdoutWins/holdout.length,holdoutWins,holdoutGames:holdout.length});
 }
 ranked.sort((a,b)=>b.accuracy-a.accuracy||b.wins-a.wins||b.trainingAccuracy-a.trainingAccuracy||a.name.localeCompare(b.name));
 return {top:ranked.slice(0,5),tested:ranked.length,training:finals.filter(g=>g.date<trainEnd).length,validation:finals.filter(g=>g.date>=trainEnd&&g.date<validationEnd).length,holdout:finals.filter(g=>g.date>=validationEnd).length,warning:'Models are ranked on validation accuracy. The last 20% of games is an untouched holdout for reporting; the top models were not selected using holdout scores. Games are processed chronologically.'};
}
