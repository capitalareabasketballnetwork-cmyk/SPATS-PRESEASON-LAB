'use client';
import {useEffect,useMemo,useRef,useState} from 'react';

type Team={id:string;name:string;conference:string;color:string;currentPrice:number;openingPrice:number;points:{date:string;price:number}[]};
type Payload={season:number;firstDate:string|null;lastDate:string|null;teams:Team[]};
type Active={id:string;index:number;x:number;y:number;value:number;date:string}|null;
const money=(value:number)=>'$'+value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const WIDTH=1000,HEIGHT=390,LEFT=65,RIGHT=20,TOP=25,BOTTOM=45;
function utcDay(s:string){return Date.parse(s+'T00:00:00Z')/86400000}

export default function MarketLines({onOpen}:{onOpen:(id:string)=>void}){
 const [payload,setPayload]=useState<Payload|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [active,setActive]=useState<Active>(null);
 const [focused,setFocused]=useState<string|null>(null);
 const [search,setSearch]=useState('');
 const svgRef=useRef<SVGSVGElement>(null);
 useEffect(()=>{
  let mounted=true;
  fetch('/api/stocks?kind=market-lines',{cache:'default'})
   .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Market graph unavailable');return data as Payload})
   .then(data=>{if(mounted)setPayload(data)})
   .catch(err=>{if(mounted)setError(String(err.message||err))})
   .finally(()=>{if(mounted)setLoading(false)});
  return()=>{mounted=false};
 },[]);
 const model=useMemo(()=>{
  if(!payload||!payload.teams.length)return null;
  const teams=payload.teams;
  const start=utcDay(payload.firstDate||new Date().toISOString().slice(0,10));
  const last=Math.max(start+1,utcDay(payload.lastDate||new Date().toISOString().slice(0,10)));
  const lower=Math.min(...teams.flatMap(t=>[t.openingPrice,...t.points.map(p=>p.price)]));
  const upper=Math.max(...teams.flatMap(t=>[t.openingPrice,...t.points.map(p=>p.price)]));
  const pad=Math.max(4,(upper-lower)*.07);
  const min=lower-pad,max=upper+pad;
  const timeX=(day:number)=>LEFT+(day-start)/(last-start)*(WIDTH-LEFT-RIGHT);
  const valueY=(value:number)=>TOP+(max-value)/(max-min)*(HEIGHT-TOP-BOTTOM);
  const mapped=teams.map(team=>{
   const data=[{date:payload.firstDate||new Date().toISOString().slice(0,10),price:team.openingPrice},
    ...team.points].map(point=>({...point,day:utcDay(point.date)}));
   // Horizontal runs between games show unchanged prices; vertical jumps
   // happen only when a recorded game changes the valuation.
   let path='M '+timeX(start)+' '+valueY(team.openingPrice);
   for(const point of data.slice(1)){
    const cx=timeX(point.day),cy=valueY(point.price);
    path+=' H '+cx+' V '+cy;
   }
   path+=' H '+timeX(last);
   return {...team,data,path};
  });
  return {mapped,min,max,start,last,timeX,valueY};
 },[payload]);
 const selected=useMemo(()=>model?.mapped.find(t=>t.id===(focused||active?.id))||null,[model,focused,active?.id]);
 const samples=useMemo(()=>model?.mapped.filter(t=>t.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0,7)||[],[model,search]);
 function valueAt(team:NonNullable<typeof model>['mapped'][number],day:number){
  let val=team.openingPrice,at=team.data[0]?.date||'';
  for(const item of team.data){if(item.day>day)break;val=item.price;at=item.date}
  return {value:val,date:at};
 }
 function hover(event:React.PointerEvent<SVGSVGElement>){
  const graph=model,svg=svgRef.current;if(!graph||!svg||focused)return;
  const rect=svg.getBoundingClientRect();
  const px=(event.clientX-rect.left)/rect.width*WIDTH;
  const py=(event.clientY-rect.top)/rect.height*HEIGHT;
  const day=graph.start+Math.max(0,Math.min(1,(px-LEFT)/(WIDTH-LEFT-RIGHT)))*(graph.last-graph.start);
  let nearest:Active=null,best=Infinity;
  for(const team of graph.mapped){
   const point=valueAt(team,day);
   const dist=Math.abs(py-graph.valueY(point.value));
   if(dist<best){best=dist;nearest={id:team.id,index:0,x:Math.max(LEFT,Math.min(WIDTH-RIGHT,px)),y:graph.valueY(point.value),value:point.value,date:point.date}}
  }
  setActive(best<24?nearest:null);
 }
 if(loading)return <section className="stock-panel stock-market-graph"><span className="stock-overline">LIVE MARKET MAP</span><h2>All-team stock movement</h2><p className="stock-muted">Loading team prices and the latest V3 performance history…</p></section>;
 if(error||!model)return <section className="stock-panel stock-market-graph"><h2>All-team stock movement</h2><p className="stock-muted">{error||'No market movements available yet.'}</p></section>;
 const hoverTeam=model.mapped.find(t=>t.id===active?.id);
 return <section className="stock-panel stock-market-graph">
  <div className="stock-panel-heading stock-market-graph-heading"><div><span className="stock-overline">MARKET MOVEMENT · {(payload?.season??2027)-1}–{String(payload?.season??2027).slice(-2)}</span><h2>Every team. One market.</h2><p className="stock-muted">Explore all {model.mapped.length} team stock lines. Hover to reveal a school and its price; click its line to open the stock details.</p></div>
   <div className="stock-market-search-wrap"><input aria-label="Find team on market chart" value={search} placeholder="Find a team's line…" onChange={e=>{setSearch(e.target.value);setFocused(null);setActive(null)}}/>
   {search&&<div className="stock-market-suggestions">{samples.map(t=><button key={t.id} onClick={()=>{setFocused(t.id);setSearch(t.name);setActive(null)}}><span className="stock-team-swatch" style={{background:t.color}}/>{t.name}<small>{money(t.currentPrice)}</small></button>)}</div>}</div>
  </div>
  <div className="stock-market-chart-frame">
   <svg ref={svgRef} className="stock-market-svg" viewBox={'0 0 '+WIDTH+' '+HEIGHT} role="img" aria-label="All Division I team current-season stock price paths. Move the pointer to select a team, then click for details." onPointerMove={hover} onPointerLeave={()=>{if(!focused)setActive(null)}} onClick={()=>{if(active?.id||focused)onOpen(focused||active!.id)}}>
    {[0,1,2,3,4].map(i=>{const price=model.max-(model.max-model.min)*i/4,y=model.valueY(price);return <g key={i}><line x1={LEFT} x2={WIDTH-RIGHT} y1={y} y2={y} stroke="currentColor" opacity=".18" strokeDasharray="4 7"/><text x={LEFT-8} y={y+4} textAnchor="end" fill="currentColor" opacity=".68" fontSize="12">{money(price)}</text></g>})}
    {model.mapped.map(t=><path key={t.id} d={t.path} fill="none" stroke={t.color} opacity={selected?.id===t.id?1: selected?0.075:0.19} strokeWidth={selected?.id===t.id?3.8:1.3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{transition:'opacity .12s,stroke-width .12s'}}/>)}
    {selected&&<path d={selected.path} fill="none" stroke={selected.color} strokeWidth="3.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{pointerEvents:'none'}}/>}
    {active&&hoverTeam&&<><line x1={active.x} x2={active.x} y1={TOP} y2={HEIGHT-BOTTOM} stroke={hoverTeam.color} opacity=".6" strokeDasharray="4 5"/><circle cx={active.x} cy={active.y} r="6" fill={hoverTeam.color} stroke="#fff" strokeWidth="1.5"/></>}
    <text x={LEFT} y={HEIGHT-12} fill="currentColor" opacity=".7" fontSize="12">{payload?.firstDate||''}</text>
    <text x={WIDTH-RIGHT} y={HEIGHT-12} textAnchor="end" fill="currentColor" opacity=".7" fontSize="12">{payload?.lastDate||''}</text>
   </svg>
   {active&&hoverTeam&&!focused&&<div className="stock-market-tooltip" style={{left:`${Math.max(12,Math.min(85,active.x/WIDTH*100))}%`,top:`${Math.max(7,active.y/HEIGHT*100-14)}%`,borderColor:hoverTeam.color}}><span className="stock-team-swatch" style={{background:hoverTeam.color}}/><div><strong>{hoverTeam.name}</strong><small>{active.date} · {money(active.value)}</small></div></div>}
   {focused&&selected&&<button className="stock-market-selected" onClick={()=>onOpen(selected.id)}><span className="stock-team-swatch" style={{background:selected.color}}/><strong>{selected.name}</strong> {money(selected.currentPrice)} <span>View stock details ↗</span></button>}
  </div>
  <div className="stock-market-graph-footer"><span>Price paths reconstructed from V3 game records and anchored to published prices. Flat segments indicate no new completed game.</span><span>Colors use official school colors where available.</span></div>
 </section>;
}
