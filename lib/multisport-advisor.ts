import {backtest,initialWeights,metrics,normalizeWeights,type Game,type WeightMap} from './multisport-model';
export type AdvisorResult={name:string;weights:WeightMap;accuracy:number;games:number;holdout:number;wins:number;trainingAccuracy:number};
const candidateModels=()=>{
 const list:Array<{name:string;weights:WeightMap}>=[{name:'Balanced',weights:initialWeights}];
 for(const m of metrics)list.push({name:m.label,weights:{[m.key]:1}});
 for(let i=0;i<metrics.length;i++)for(let j=i+1;j<metrics.length;j++)for(const ratio of [[1,1],[2,1],[1,2]])list.push({name:metrics[i].label+' + '+metrics[j].label+' ('+ratio.join(':')+')',weights:normalizeWeights({[metrics[i].key]:ratio[0],[metrics[j].key]:ratio[1]})});
 return list;
};
export function rankAdvisorModels(games:Game[]):{top:AdvisorResult[];tested:number;training:number;validation:number;warning:string}{
 const finals=games.filter(g=>g.final&&g.homeScore!==null&&g.awayScore!==null&&g.homeScore!==g.awayScore).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 if(finals.length<40)return {top:[],tested:0,training:0,validation:0,warning:'At least 40 completed, non-tied games are required.'};
 const cutoff=finals[Math.floor(finals.length*.7)]?.date||'';
 const candidates=candidateModels(),ranked:AdvisorResult[]=[];
 for(const c of candidates){
  const predictions=backtest(games,c.weights).filter(p=>p.correct!==null);
  const training=predictions.filter(p=>p.date<cutoff),holdout=predictions.filter(p=>p.date>=cutoff);
  if(training.length<15||holdout.length<10)continue;
  const wins=holdout.filter(p=>p.correct===true).length;
  ranked.push({name:c.name,weights:c.weights,accuracy:100*wins/holdout.length,games:predictions.length,holdout:holdout.length,wins,trainingAccuracy:100*training.filter(p=>p.correct===true).length/training.length});
 }
 ranked.sort((a,b)=>b.accuracy-a.accuracy||b.wins-a.wins||b.trainingAccuracy-a.trainingAccuracy||a.name.localeCompare(b.name));
 return {top:ranked.slice(0,5),tested:ranked.length,training:finals.filter(g=>g.date<cutoff).length,validation:finals.filter(g=>g.date>=cutoff).length,warning:'The top five are selected using the validation results. Their reported accuracy is therefore selection-biased, not an untouched out-of-sample estimate. No future results are used to predict earlier games.'};
}
