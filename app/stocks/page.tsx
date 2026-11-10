'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import './stocks.css';

type Team={id:string;name:string;conference:string;logoUrl:string|null;price:number|null;games:number;updatedAt:string|null};
type Player={id:string;name:string;position:string;teamId:string;price:number|null;openingPrice:number|null;ppg:number|null;rpg:number|null;apg:number|null;games:number|null};
type Stock=({asset:'team'}&Team)|({asset:'player'}&Player);
type History={date:string;value:number;gameId:string;priceBefore?:number|null;priceChange?:number|null;opponent?:string|null;score?:string|null;result?:'W'|'L'|null;change?:number;event?:string};
type Snapshot={teams:Team[];players:Player[];asOf:string;playerPricesPublished:boolean;playerWarning?:string;coverage?:{season:number;teamGames:number;latestTeamGameDate:string|null;playerGamesCovered:number;playerCoveragePartial?:boolean}};
type Tab='overview'|'teams'|'players'|'screener';
type Sort='price'|'name'|'change';
const cash=(v:number|null|undefined)=>typeof v==='number'&&Number.isFinite(v)?'$'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const percent=(v:number|null)=>v===null?'—':(v>=0?'+':'')+v.toFixed(2)+'%';
const esc=(v:string)=>encodeURIComponent(v);
function Logo({url,name,size=42}:{url:string|null;name:string;size?:number}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[url]);
 return <span className="stock-logo" style={{width:size,height:size}}>{url&&!failed?<img src={url} alt={name+' logo'} loading="lazy" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{name.slice(0,2).toUpperCase()}</span>}</span>;
}
function Portrait({id,name,size=42}:{id:string;name:string;size?:number}){
 const [url,setUrl]=useState<string|null>(null);
 const [failed,setFailed]=useState(false);
 const [visible,setVisible]=useState(false);
 const ref=useRef<HTMLSpanElement>(null);
 useEffect(()=>{setUrl(null);setFailed(false);setVisible(false)},[id,name]);
 useEffect(()=>{
  const el=ref.current;if(!el)return;
  if(!('IntersectionObserver' in window)){setVisible(true);return}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:'120px'});
  observer.observe(el);return()=>observer.disconnect();
 },[id]);
 useEffect(()=>{
  if(!visible||!/^\d+$/.test(id))return;
  let active=true;
  fetch(`/api/stocks?kind=portrait&id=${esc(id)}&name=${esc(name)}`)
   .then(r=>r.ok?r.json():null).then(data=>{if(active)setUrl(data?.photoUrl||null)})
   .catch(()=>{});
  return()=>{active=false};
 },[id,name,visible]);
 return <span ref={ref} className="stock-portrait" style={{width:size,height:size}}>{url&&!failed?<img src={url} alt={name} loading="lazy" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{name.split(' ').map(v=>v[0]).slice(0,2).join('')}</span>}</span>;
}
function PriceChart({history}:{history:History[]}){
 const [range,setRange]=useState<'1W'|'1M'|'3M'|'1Y'|'ALL'>('ALL');
 const [active,setActive]=useState<number|null>(null);
 const [dragging,setDragging]=useState(false);
 const chartRef=useRef<SVGSVGElement>(null);
 const current=useMemo(()=>history.filter(h=>h.date&&Number.isFinite(h.value)).sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId)),[history]);
 const filtered=useMemo(()=>{
  if(range==='ALL')return current;
  const days={'1W':7,'1M':30,'3M':90,'1Y':365}[range];
  const cutoff=Date.now()-days*86400000;
  return current.filter(h=>new Date(h.date).getTime()>=cutoff);
 },[current,range]);
 useEffect(()=>{setActive(null)},[range,history]);
 const first=filtered[0]?.priceBefore??filtered[0]?.value??0;
 const last=filtered[filtered.length-1]?.value??0;
 const positive=last>=first;
 const values=filtered.flatMap(v=>[v.value,...(v.priceBefore==null?[]:[v.priceBefore])]);
 const minimum=values.length?Math.min(...values):0,maximum=values.length?Math.max(...values):1;
 const padding=Math.max(.25,(maximum-minimum)*.18),bottom=minimum-padding,top=maximum+padding;
 const x=(i:number)=>filtered.length===1?330:30+600*i/Math.max(1,filtered.length-1);
 const y=(n:number)=>220-(n-bottom)/(top-bottom)*190;
 const points=filtered.map((v,i)=>x(i).toFixed(1)+','+y(v.value).toFixed(1)).join(' ');
 const selected=active!==null?filtered[active]:null;
 const previous=selected?.priceBefore??(active!==null&&active>0?filtered[active-1]?.value:null);
 const difference=selected?.priceChange??(previous===null||previous===undefined||!selected?null:selected.value-previous);
 const changeClass=difference===null?'':difference>=0?'stock-up':'stock-down';
 const chosenX=active===null?0:x(active),chosenY=active===null?0:y(filtered[active].value);
 const onMove=(event:React.PointerEvent<SVGSVGElement>)=>{
  if(!filtered.length)return;
  const box=event.currentTarget.getBoundingClientRect();
  const px=(event.clientX-box.left)/box.width*650;
  const next=filtered.length===1?0:Math.max(0,Math.min(filtered.length-1,Math.round((px-30)/600*(filtered.length-1))));
  setActive(next);
 };
 return <div className="stock-chart">
  <div className="stock-chart-top"><div><span className="stock-overline">PRICE HISTORY</span><h3>{cash(last||null)} <small className={positive?'stock-up':'stock-down'}>{filtered.length>1&&first?percent((last/first-1)*100):'—'}</small></h3></div><div className="stock-time">{(['1W','1M','3M','1Y','ALL'] as const).map(r=><button key={r} className={r===range?'selected':''} onClick={()=>setRange(r)}>{r}</button>)}</div></div>
  {filtered.length?
   <>
    <svg ref={chartRef} className="stock-interactive-chart" viewBox="0 0 650 255" role="img" aria-label="Touch or drag along the price chart to inspect individual games" onPointerMove={onMove} onPointerDown={e=>{setDragging(true);e.currentTarget.setPointerCapture(e.pointerId);onMove(e)}} onPointerUp={e=>{setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>setDragging(false)} onPointerLeave={()=>{if(!dragging)setActive(null)}}>
     <defs><linearGradient id="spatsPriceFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={positive?'#27d69d':'#fb6b83'} stopOpacity=".28"/><stop offset="1" stopColor={positive?'#27d69d':'#fb6b83'} stopOpacity="0"/></linearGradient></defs>
     {[0,1,2,3,4].map(i=><line key={i} x1="30" x2="630" y1={25+i*47} y2={25+i*47} stroke="#26344a" strokeDasharray="4 5"/> )}
     {filtered.length>1?<><polygon points={`30,232 ${points} 630,232`} fill="url(#spatsPriceFade)"/><polyline points={points} fill="none" stroke={positive?'#27d69d':'#fb6b83'} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/></>:<circle cx={330} cy={y(filtered[0].value)} r="5" fill="#27d69d"/>}
     {active!==null&&<><line x1={chosenX} x2={chosenX} y1={20} y2={232} stroke="#b2c8e4" strokeDasharray="4 4"/><circle cx={chosenX} cy={chosenY} r="7" fill={difference!==null&&difference<0?'#fb6b83':'#27d69d'} stroke="#0f1a2c" strokeWidth="3"/></>}
     <text x="32" y="247" fill="#9aaec6" fontSize="12">{filtered[0]?.date.slice(0,10)}</text><text x="535" y="247" fill="#9aaec6" fontSize="12">{filtered[filtered.length-1]?.date.slice(0,10)}</text>
   </svg>
   <div className="stock-game-inspector" aria-live="polite">
    {selected?<><div className="stock-game-header"><span>{selected.date.slice(0,10)}</span><b className={changeClass}>{difference===null?'Price change unavailable':(difference>=0?'+':'−')+cash(Math.abs(difference))}</b></div>
     <div className="stock-game-line"><span>{selected.opponent?'vs '+selected.opponent:selected.event||'Game details unavailable'}</span><span>{selected.score||'Score unavailable'}</span>{selected.result&&<b className={selected.result==='W'?'stock-up':'stock-down'}>{selected.result}</b>}</div>
     <div className="stock-game-prices"><span>Before {cash(previous??null)}</span><span>After {cash(selected.value)}</span></div>
    </>:<span className="stock-muted">Touch or drag across the chart to inspect a game, opponent, final score, W/L, and stock price change.</span>}
   </div>
   </>
  :<div className="stock-empty-chart">{current.length?<>No recorded stock price changes for this {range==='1W'?'week':range==='1M'?'month':range==='3M'?'three-month period':'year'}.<br/>Most recent recorded game: {current[current.length-1]?.date.slice(0,10)}.<br/>Select ALL to see earlier prices.</>:'No verified price-history events are published for this stock yet.'}</div>}
 </div>;
}
export default function StocksPage(){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [tab,setTab]=useState<Tab>('overview'),[market,setMarket]=useState<'all'|'team'|'player'>('all'),[search,setSearch]=useState(''),[sort,setSort]=useState<Sort>('price'),[ascending,setAscending]=useState(false);
 const [selected,setSelected]=useState<Stock|null>(null),[history,setHistory]=useState<History[]>([]),[historyLoading,setHistoryLoading]=useState(false);
 const [histories,setHistories]=useState<Record<string,History[]>>({});
 useEffect(()=>{let active=true;fetch('/api/stocks',{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Market unavailable');if(active)setData(j)}).catch(e=>{if(active)setError(String(e.message||e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const stocks=useMemo<Stock[]>(()=>data?[...data.teams.map(t=>({...t,asset:'team' as const})),...data.players.map(p=>({...p,asset:'player' as const}))]:[],[data]);
 const chosenId=selected?selected.asset+':'+selected.id:'';
 useEffect(()=>{if(!selected)return;let active=true;setHistory([]);setHistoryLoading(true);fetch(`/api/stocks?kind=history&asset=${selected.asset}&id=${esc(selected.id)}`,{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'History unavailable');if(active){setHistory(j.data||[]);setHistories(prev=>({...prev,[selected.asset+':'+selected.id]:j.data||[]}))}}).catch(()=>{if(active)setHistory([])}).finally(()=>{if(active)setHistoryLoading(false)});return()=>{active=false}},[chosenId]);
 const change=(stock:Stock)=>{const h=histories[stock.asset+':'+stock.id];if(!h||h.length<2||!h[0].value)return null;return (h[h.length-1].value/h[0].value-1)*100};
 const rows=useMemo(()=>stocks.filter(s=>(market==='all'||s.asset===market)&&(!search||((s.asset==='team'?s.name:s.name)+' '+(s.asset==='team'?s.conference:s.position)).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>{let n=0;if(sort==='name')n=a.name.localeCompare(b.name);else if(sort==='change')n=(change(a)??-Infinity)-(change(b)??-Infinity);else n=(a.price??-1)-(b.price??-1);return ascending?n:-n}),[stocks,market,search,sort,ascending,histories]);
 const leaders=data?.teams.filter(t=>t.price!==null).slice().sort((a,b)=>(b.price??0)-(a.price??0)).slice(0,5)||[];
 const pricedPlayers=data?.players.filter(p=>p.price!==null).length||0;
 const setSortBy=(v:Sort)=>{if(sort===v)setAscending(x=>!x);else {setSort(v);setAscending(v==='name')}};
 const open=(s:Stock)=>setSelected(s);
 return <main className="stocks-page">
 <div className="stocks-top"><div><div className="stock-overline">SPATS · NCAA DIVISION I · MEN'S BASKETBALL</div><h1>College Basketball <em>Stock Exchange</em></h1><p>Track model-based valuations for every Division I team and emerging player stocks. Prices are analytical indexes, not real securities.</p></div><div className="stocks-live"><span className="stocks-live-dot"/> {data?'MARKET DATA CONNECTED':'MARKET STATUS'}</div></div>
 <div className="stocks-tabs">{(['overview','teams','players','screener'] as const).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>{setTab(t);setMarket(t==='teams'?'team':t==='players'?'player':'all')}}>{t==='overview'?'Overview':t==='teams'?'Team Stocks':t==='players'?'Player Stocks':'Market Screener'}</button>)}</div>
 {error&&<div className="stocks-notice stock-error"><b>Market data connection needed.</b> {error}<p>Team and player prices will appear when the SPATS market schema is connected to this website's Supabase environment. No placeholder prices are shown.</p></div>}
 {loading&&<div className="stocks-notice">Loading verified SPATS market prices…</div>}
 {data&&<>{data.coverage&&<div className="stock-season-status"><b>2026–27 data coverage:</b> {data.coverage.teamGames.toLocaleString()} final D1 team games through {data.coverage.latestTeamGameDate||'unknown date'}; {data.coverage.playerGamesCovered.toLocaleString()} games with player box scores. <span className="stock-muted">Counts indicate imports, not guaranteed completeness through today.</span></div>}<div className="stock-metrics"><div><span>TEAM STOCKS</span><strong>{data.teams.filter(x=>x.price!==null).length}</strong><small>Published team valuations</small></div><div><span>PLAYER DIRECTORY</span><strong>{data.players.length.toLocaleString()}</strong><small>2026–27 season records</small></div><div><span>PLAYER PRICES</span><strong>{pricedPlayers.toLocaleString()}</strong><small>{pricedPlayers?'Published valuations':'Pending V5 model'}</small></div><div><span>PRICED TEAM HIGH</span><strong>{cash(leaders[0]?.price)}</strong><small>{leaders[0]?.name||'No prices yet'}</small></div></div>
 {tab==='overview'&&<><div className="stocks-overview-grid"><section className="stock-panel"><div className="stock-panel-heading"><div><span className="stock-overline">MARKET LEADERS</span><h2>Highest-valued teams</h2></div><button className="stock-inline" onClick={()=>{setTab('teams');setMarket('team')}}>View all →</button></div><div className="stock-leaders">{leaders.map((t,i)=><button key={t.id} className="stock-leader" onClick={()=>open({...t,asset:'team'})}><span className="stock-place">{String(i+1).padStart(2,'0')}</span><Logo url={t.logoUrl} name={t.name}/><span className="stock-leader-name"><b>{t.name}</b><small>{t.conference||'Division I'}</small></span><strong>{cash(t.price)}</strong></button>)}{!leaders.length&&<p className="stock-muted">No published team prices returned.</p>}</div></section><section className="stock-panel stock-spotlight"><span className="stock-overline">PLAYER MARKET</span><div className="stock-spotlight-icon">↗</div><h2>Player stocks are coming online</h2><p>The player directory is linked to imported box scores. Stock opening prices and performance movements will appear when the V5 model is approved and published.</p><div className="stock-spotlight-count"><b>{data.players.length.toLocaleString()}</b><span>players in the directory</span></div><button onClick={()=>{setTab('players');setMarket('player')}} className="stock-action">Explore players →</button></section></div><section className="stock-panel"><div className="stock-panel-heading"><div><span className="stock-overline">STOCK RESEARCH</span><h2>Explore the entire market</h2></div><button className="stock-inline" onClick={()=>setTab('screener')}>Open screener →</button></div><p className="stock-muted">Filter by teams or players, sort published valuations, then open a stock to see game-by-game price history and performance trends.</p></section></>}
 {(tab==='screener'||tab==='teams'||tab==='players')&&<section className="stock-panel"><div className="stock-panel-heading"><div><span className="stock-overline">SPATS MARKET SCREENER</span><h2>{tab==='teams'?'Team stocks':tab==='players'?'Player stocks':'All stocks'}</h2></div><span className="stock-count">{rows.length.toLocaleString()} assets</span></div><div className="stock-filters"><input aria-label="Search players or teams" placeholder="Search players, schools, conferences…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter asset type" value={market} onChange={e=>setMarket(e.target.value as typeof market)}><option value="all">All assets</option><option value="team">Teams</option><option value="player">Players</option></select><select aria-label="Sort stocks" value={sort} onChange={e=>setSortBy(e.target.value as Sort)}><option value="price">Stock price</option><option value="name">Name</option><option value="change">Price change (loaded)</option></select><button className="stock-order" onClick={()=>setAscending(!ascending)} aria-label="Reverse sort">{ascending?'↑ Asc':'↓ Desc'}</button></div><div className="stock-table-scroll"><table className="stock-table"><thead><tr><th>Asset</th><th>Type</th><th>Team / Conference</th><th>Stock price</th><th>Games / PPG</th><th>Details</th></tr></thead><tbody>{rows.slice(0,300).map(s=><tr key={s.asset+s.id} onClick={()=>open(s)}><td><span className="stock-asset-cell">{s.asset==='team'?<Logo url={s.logoUrl} name={s.name}/>:<span className="stock-player-identity"><Portrait id={s.id} name={s.name}/><Logo url={data.teams.find(t=>t.id===s.teamId)?.logoUrl||null} name={data.teams.find(t=>t.id===s.teamId)?.name||'Team'} size={21}/></span>}<span><b>{s.name}</b><small>{s.asset==='team'?s.conference:s.position||'Player'}</small></span></span></td><td><span className="stock-tag">{s.asset==='team'?'TEAM':'PLAYER'}</span></td><td>{s.asset==='team'?s.conference:(data.teams.find(t=>t.id===s.teamId)?.name||'—')}</td><td className="stock-price-cell">{cash(s.price)}</td><td>{s.asset==='team'?s.games.toLocaleString():(s.ppg?.toFixed(1)||'—')}</td><td><button className="stock-inline" onClick={e=>{e.stopPropagation();open(s)}}>Chart ↗</button></td></tr>)}</tbody></table></div>{rows.length>300&&<p className="stock-muted">Showing the first 300 matching assets. Refine your search to find more.</p>}{!rows.length&&<p className="stock-muted">No matching assets found.</p>}{data.playerWarning&&<p className="stock-muted">Player data: {data.playerWarning}</p>}</section>}
 </>}
 <p className="stock-disclaimer">SPATS stock values are simulated analytical indexes. Team prices are based on SPATS's proprietary performance model. Player values and top gainers / losers will populate only after verified pricing histories are published. Portraits and logos are best-effort and may fall back to initials.</p>
 {selected&&<div className="stocks-modal-backdrop" role="presentation" onMouseDown={()=>setSelected(null)}><div role="dialog" aria-modal="true" aria-label={selected.name+' stock details'} className="stocks-modal" onMouseDown={e=>e.stopPropagation()}><div className="stocks-modal-head"><div className="stocks-modal-person">{selected.asset==='team'?<Logo url={selected.logoUrl} name={selected.name} size={64}/>:<span className="stock-player-identity"><Portrait id={selected.id} name={selected.name} size={64}/><Logo url={data?.teams.find(t=>t.id===selected.teamId)?.logoUrl||null} name={data?.teams.find(t=>t.id===selected.teamId)?.name||'Team'} size={28}/></span>}<div><span className="stock-overline">{selected.asset==='team'?'TEAM STOCK':'PLAYER STOCK'}</span><h2>{selected.name}</h2><span className="stock-muted">{selected.asset==='team'?selected.conference:(data?.teams.find(t=>t.id===selected.teamId)?.name||selected.position)}</span></div></div><button className="stocks-close" onClick={()=>setSelected(null)} aria-label="Close details">✕</button></div><div className="stock-detail-metrics"><div><span>STOCK PRICE</span><strong>{cash(selected.price)}</strong></div><div><span>{selected.asset==='team'?'GAMES ANALYZED':'POINTS / GAME'}</span><strong>{selected.asset==='team'?selected.games.toLocaleString():(selected.ppg?.toFixed(1)||'—')}</strong></div><div><span>GAMES PROCESSED</span><strong>{selected.games??'—'}</strong></div></div>{historyLoading?<p className="stock-muted">Loading stock history…</p>:<PriceChart history={history}/>}<div className="stock-modal-foot"><span>Historical movements are calculated from recorded games and model events.</span><button onClick={()=>setSelected(null)}>Close</button></div></div></div>}
 </main>;
}
