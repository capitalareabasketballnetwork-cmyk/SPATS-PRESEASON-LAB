export type League='college-football'|'college-basketball'|'nba';
export const leagues={
 'college-football':{name:'College Football',subtitle:'FBS game prediction lab',sport:'football',division:'college-football',seasons:Array.from({length:2026-2010+1},(_,i)=>2010+i),startMonth:8,endMonth:1,kind:'football'},
 'college-basketball':{name:'College Basketball',subtitle:'NCAA Division I men’s game prediction lab',sport:'basketball',division:'mens-college-basketball',seasons:[2024,2025,2026,2027],startMonth:11,endMonth:4,kind:'basketball'},
 nba:{name:'NBA',subtitle:'Professional basketball game prediction lab',sport:'basketball',division:'nba',seasons:[2024,2025,2026,2027],startMonth:10,endMonth:6,kind:'basketball'}
} as const;
export type Metric='win_pct'|'point_margin'|'points_for'|'points_against'|'recent_win_pct'|'recent_margin'|'home_win_pct'|'away_win_pct'|'recent_points_for'|'recent_points_against'|'scoring_consistency'|'defensive_consistency'|'blowout_win_pct'|'close_game_win_pct'|'scoring_trend'|'margin_trend'|'shutout_pct'|'defensive_shutout_pct'|'home_margin'|'away_margin';
export const metrics:{key:Metric;label:string;description:string;scale:number;direction:number}[]=[
 {key:'win_pct',label:'Win Percentage',description:'Wins divided by completed games before the matchup',scale:0.3,direction:1},
 {key:'point_margin',label:'Average Point Differential',description:'Average points scored minus points allowed',scale:15,direction:1},
 {key:'points_for',label:'Points Scored / Game',description:'Average offensive scoring before the matchup',scale:25,direction:1},
 {key:'points_against',label:'Points Allowed / Game',description:'Average defensive scoring allowed',scale:25,direction:-1},
 {key:'recent_win_pct',label:'Last 5 Win Percentage',description:'Record across up to five previous games',scale:0.3,direction:1},
 {key:'recent_margin',label:'Last 5 Point Differential',description:'Average scoring margin over up to five previous games',scale:15,direction:1},
 {key:'home_win_pct',label:'Home Win Percentage',description:'Home performance prior to the matchup (neutral fallback to overall)',scale:0.3,direction:1},
 {key:'away_win_pct',label:'Away Win Percentage',description:'Road performance prior to the matchup (neutral fallback to overall)',scale:0.3,direction:1},
 {key:'recent_points_for',label:'Last 5 Points Scored / Game',description:'Offensive scoring average across the five previous games',scale:25,direction:1},
 {key:'recent_points_against',label:'Last 5 Points Allowed / Game',description:'Defensive scoring average across the five previous games',scale:25,direction:-1},
 {key:'scoring_consistency',label:'Offensive Scoring Consistency',description:'Standard deviation of points scored; lower is more consistent',scale:12,direction:-1},
 {key:'defensive_consistency',label:'Defensive Scoring Consistency',description:'Standard deviation of points allowed; lower is more consistent',scale:12,direction:-1},
 {key:'blowout_win_pct',label:'Two-Touchdown Win Rate',description:'Share of previous games won by at least 14 points (football)',scale:0.3,direction:1},
 {key:'close_game_win_pct',label:'One-Score Game Win Rate',description:'Win rate in games decided by eight points or fewer; neutral fallback if none',scale:0.3,direction:1},
 {key:'scoring_trend',label:'Recent Offensive Scoring Trend',description:'Last five scoring average minus full-season scoring average',scale:15,direction:1},
 {key:'margin_trend',label:'Recent Point Differential Trend',description:'Last five average margin minus full-season average margin',scale:15,direction:1},
 {key:'shutout_pct',label:'Offensive Shutout Avoidance',description:'Share of previous games in which the team scored',scale:0.15,direction:1},
 {key:'defensive_shutout_pct',label:'Defensive Shutout Rate',description:'Share of previous games in which the opponent scored zero',scale:0.15,direction:1},
 {key:'home_margin',label:'Home Point Differential',description:'Average scoring margin at home; overall fallback when no home games',scale:15,direction:1},
 {key:'away_margin',label:'Away Point Differential',description:'Average scoring margin away; overall fallback when no road games',scale:15,direction:1}
];
export type Game={id:string;date:string;week?:number;home:string;away:string;homeScore:number|null;awayScore:number|null;neutral:boolean;final:boolean};
export type Prediction=Game&{pick:string;edge:number;correct:boolean|null;homeGames:number;awayGames:number};
export type WeightMap=Partial<Record<Metric,number>>;
export const cfbMetrics=metrics;
export const initialWeights:WeightMap={win_pct:0.2,point_margin:0.25,points_for:0.1,points_against:0.1,recent_win_pct:0.15,recent_margin:0.2};
type History={points:number;allowed:number;won:boolean;home:boolean;away:boolean}[];
function profile(history:History):Record<Metric,number>{
 const avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
 const recent=history.slice(-5),home=history.filter(x=>x.home),away=history.filter(x=>x.away);
 const win=(arr:History)=>arr.length?arr.filter(x=>x.won).length/arr.length:0.5;
 const deviation=(values:number[])=>values.length>1?Math.sqrt(avg(values.map(x=>(x-avg(values))**2))):0;
 const margin=(arr:History)=>avg(arr.map(x=>x.points-x.allowed));
 const close=history.filter(x=>Math.abs(x.points-x.allowed)<=8);
 return {win_pct:win(history),point_margin:avg(history.map(x=>x.points-x.allowed)),points_for:avg(history.map(x=>x.points)),points_against:avg(history.map(x=>x.allowed)),recent_win_pct:win(recent),recent_margin:avg(recent.map(x=>x.points-x.allowed)),home_win_pct:home.length?win(home):win(history),away_win_pct:away.length?win(away):win(history),recent_points_for:avg(recent.map(x=>x.points)),recent_points_against:avg(recent.map(x=>x.allowed)),scoring_consistency:deviation(history.map(x=>x.points)),defensive_consistency:deviation(history.map(x=>x.allowed)),blowout_win_pct:history.length?history.filter(x=>x.points-x.allowed>=14).length/history.length:0,close_game_win_pct:win(close),scoring_trend:avg(recent.map(x=>x.points))-avg(history.map(x=>x.points)),margin_trend:margin(recent)-margin(history),shutout_pct:history.length?history.filter(x=>x.points>0).length/history.length:0,defensive_shutout_pct:history.length?history.filter(x=>x.allowed===0).length/history.length:0,home_margin:home.length?margin(home):margin(history),away_margin:away.length?margin(away):margin(history)};
}
export function backtest(games:Game[],weights:WeightMap,minimumGames=3):Prediction[]{
 const histories=new Map<string,History>(),out:Prediction[]=[];
 const sorted=[...games].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 for(const g of sorted){
  const h=histories.get(g.home)||[],a=histories.get(g.away)||[];
  if(h.length>=minimumGames&&a.length>=minimumGames){
   const hp=profile(h),ap=profile(a);
   const edge=metrics.reduce((sum,m)=>sum+((hp[m.key]-ap[m.key])/m.scale)*m.direction*(weights[m.key]||0),0);
   const pick=edge>=0?g.home:g.away;
   const winner=g.final&&g.homeScore!==null&&g.awayScore!==null&&g.homeScore!==g.awayScore?(g.homeScore>g.awayScore?g.home:g.away):null;
   out.push({...g,pick,edge:Number(edge.toFixed(3)),correct:winner?pick===winner:null,homeGames:h.length,awayGames:a.length});
  }
  if(g.final&&g.homeScore!==null&&g.awayScore!==null&&g.homeScore!==g.awayScore){
   const homeWon=g.homeScore>g.awayScore;
   histories.set(g.home,[...h,{points:g.homeScore,allowed:g.awayScore,won:homeWon,home:!g.neutral,away:false}]);
   histories.set(g.away,[...a,{points:g.awayScore,allowed:g.homeScore,won:!homeWon,home:false,away:!g.neutral}]);
  }
 }
 return out;
}
export function normalizeWeights(w:WeightMap):WeightMap{
 const keys=Object.keys(w) as Metric[],total=keys.reduce((a,k)=>a+(Number(w[k])||0),0);
 if(!total)return w;let assigned=0;const out:WeightMap={};
 keys.forEach((k,i)=>{const value=i===keys.length-1?Number((1-assigned).toFixed(3)):Number(((w[k]||0)/total).toFixed(3));out[k]=value;assigned+=value});return out;
}
