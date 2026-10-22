import {backtest,type Game,type WeightMap} from './multisport-model';
export type OddsGame={id:string;season:number;date:string;home:string;away:string;homeScore:number|null;awayScore:number|null;lines:Array<{provider:string;spread:number|null;overUnder:number|null;homeMoneyline:number|null;awayMoneyline:number|null}>};
export type BetRow={id:string;date:string;game:string;pick:string;line:string;price:number;provider:string;result:'Win'|'Loss'|'Push';profit:number;returnAmount:number;confidence:string;confidenceScore:number;method:string};
const canon=(s:string)=>s.toLowerCase().replace(/\b(university|college|the|of|at|state university)\b/g,'').replace(/[^a-z0-9]/g,'').replace(/st$/,'state').replace(/^(miami)(florida)$/,'miamifl');
const aliases:Record<string,string>={olemiss:'mississippi',mississippi:'mississippi',ucf:'centralflorida',centralflorida:'centralflorida',utsa:'texassanantonio',texassanantonio:'texassanantonio',uconn:'connecticut',connecticut:'connecticut',smu:'southernmethodist',southernmethodist:'southernmethodist',byu:'brighamyoung',brighamyoung:'brighamyoung',usf:'southflorida',southflorida:'southflorida',lsu:'louisianastate',louisianastate:'louisianastate',pitt:'pittsburgh',pittsburgh:'pittsburgh',unlv:'nevadalasvegas',nevadalasvegas:'nevadalasvegas',umass:'massachusetts',massachusetts:'massachusetts',appstate:'appalachianstate',appalachianstate:'appalachianstate',fau:'floridaatlantic',floridaatlantic:'floridaatlantic',fiu:'floridainternational',floridainternational:'floridainternational',ulm:'louisianamonroe',louisianamonroe:'louisianamonroe',ull:'louisiana',louisianalafayette:'louisiana',louisiana:'louisiana',texasam:'texasam',texasaandm:'texasam',ncstate:'northcarolinastate',northcarolinastate:'northcarolinastate',southernmiss:'southernmississippi',southernmississippi:'southernmississippi',miamioh:'miamiohio',miamiohio:'miamiohio'};
const key=(s:string)=>aliases[canon(s)]||canon(s);
const same=(a:string,b:string)=>key(a)===key(b);
const americanProfit=(price:number,stake:number)=>price>0?stake*price/100:stake*100/Math.abs(price);
const score=(g:Game)=>g.final&&g.homeScore!==null&&g.awayScore!==null;
export function simulateCfb(games:Game[],odds:OddsGame[],weights:WeightMap,market:'moneyline'|'spread'|'total',stake:number,minimum:number,providerPreference=''): {rows:BetRow[];matched:number;eligible:number;unpriced:number;unmatched:number;unprojected:number;summary:{bets:number;wins:number;losses:number;pushes:number;profit:number;risked:number;roi:number}}{
 const preds=backtest(games,weights);
 
 const history=new Map<string,Array<{date:string;scored:number;allowed:number}>>();
 for(const g of [...games].sort((a,b)=>a.date.localeCompare(b.date))){if(!score(g))continue;for(const [team,scored,allowed] of [[g.home,g.homeScore!,g.awayScore!],[g.away,g.awayScore!,g.homeScore!]] as [string,number,number][])history.set(key(team),[...(history.get(key(team))||[]),{date:g.date,scored,allowed}])}
 const rows:BetRow[]=[];let matched=0,eligible=0,unpriced=0,unmatched=0,unprojected=0;
 for(const p of preds){if(!score(p))continue;const game=odds.find(o=>o.id===p.id)||odds.find(o=>same(o.home,p.home)&&same(o.away,p.away)&&Math.abs(new Date(o.date).getTime()-new Date(p.date).getTime())<=36*3600000);if(!game){unmatched++;continue}matched++;
 const options=providerPreference?game.lines.filter(l=>l.provider===providerPreference):game.lines;
 const line=options.find(l=>market==='moneyline'?l.homeMoneyline!==null&&l.awayMoneyline!==null:market==='spread'?l.spread!==null:l.overUnder!==null);
 if(!line){unpriced++;continue}
 const h=(history.get(key(p.home))||[]).filter(x=>x.date<p.date).slice(-5),a=(history.get(key(p.away))||[]).filter(x=>x.date<p.date).slice(-5);
 const avg=(arr:number[])=>arr.reduce((x,y)=>x+y,0)/Math.max(1,arr.length);
 let pick='',label='',outcome:'Win'|'Loss'|'Push',price=0,method='Saved model winner';
 let marketEdge=Math.abs(p.edge);
 if(market==='moneyline'){
  pick=p.pick;price=p.pick===p.home?line.homeMoneyline!:line.awayMoneyline!;label=price>0?'+'+price:String(price);
  if(!Number.isFinite(price)||price===0){unpriced++;continue}
  outcome=p.pick===p.home?(p.homeScore!>p.awayScore!?'Win':p.homeScore===p.awayScore?'Push':'Loss'):(p.awayScore!>p.homeScore!?'Win':p.homeScore===p.awayScore?'Push':'Loss');
 }else{
  if(h.length<3||a.length<3){unprojected++;continue}
  const homeExpected=(avg(h.map(x=>x.scored))+avg(a.map(x=>x.allowed)))/2;
  const awayExpected=(avg(a.map(x=>x.scored))+avg(h.map(x=>x.allowed)))/2;
  if(market==='spread'){
   const projectedMargin=homeExpected-awayExpected;
   marketEdge=Math.abs(projectedMargin+line.spread!)/Math.max(7,(homeExpected+awayExpected)*.20);
   const homeCover=projectedMargin+line.spread!>0;
   if(Math.abs(projectedMargin+line.spread!)<0.0001){unprojected++;continue}
   pick=(homeCover?p.home:p.away)+' ATS';label=(line.spread!>0?'+':'')+line.spread;
   const actual=p.homeScore!-p.awayScore!+line.spread!;
   outcome=actual===0?'Push':(actual>0)===homeCover?'Win':'Loss';method='Pregame 5-game scoring projection (not saved-model spread forecast)';
  }else{
   const projectedTotal=homeExpected+awayExpected;
   marketEdge=Math.abs(projectedTotal-line.overUnder!)/Math.max(7,projectedTotal*.20);
   if(Math.abs(projectedTotal-line.overUnder!)<0.0001){unprojected++;continue}
   const over=projectedTotal>line.overUnder!;pick=over?'Over':'Under';label=String(line.overUnder);
   const actual=p.homeScore!+p.awayScore!-line.overUnder!;
   outcome=actual===0?'Push':(actual>0)===over?'Win':'Loss';method='Pregame 5-game scoring projection (not saved-model total forecast)';
  }
  price=-110; // CFBD does not provide spread/total juice; explicitly hypothetical
 }
 // For spread and total, use the projected edge against that market's line.
 // This is a relative score, not a calibrated probability of winning.
 const confidence=marketEdge>=.65?'High':marketEdge>=.3?'Medium':'Low';
 const confidenceScore=Math.round(50+40*Math.min(1,marketEdge/.65));
 if(confidenceScore<minimum)continue;
 eligible++;
 const profit=outcome==='Push'?0:outcome==='Win'?americanProfit(price,stake):-stake;
 rows.push({id:p.id,date:p.date,game:p.away+' @ '+p.home,pick,line:label,price,provider:line.provider,result:outcome,profit,returnAmount:outcome==='Push'?stake:outcome==='Win'?stake+profit:0,confidence,confidenceScore,method});
 }
 const wins=rows.filter(r=>r.result==='Win').length,losses=rows.filter(r=>r.result==='Loss').length,pushes=rows.filter(r=>r.result==='Push').length,profit=rows.reduce((n,r)=>n+r.profit,0),risked=(wins+losses)*stake;
 return {rows,matched,eligible,unpriced,unmatched,unprojected,summary:{bets:rows.length,wins,losses,pushes,profit,risked,roi:risked?profit/risked*100:0}};
}
