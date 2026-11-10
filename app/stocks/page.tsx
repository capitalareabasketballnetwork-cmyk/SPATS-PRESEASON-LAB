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
function Portrait({id,name,teamLogoUrl,size=42}:{id:string;name:string;teamLogoUrl:string|null;size?:number}){
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
  fetch(`/api/stocks?kind=portrait&id=${esc(id)}&name=${esc(name)}&teamLogo=${esc(teamLogoUrl||'')}`)
   .then(r=>r.ok?r.json():null).then(data=>{if(active)setUrl(data?.photoUrl||null)})
   .catch(()=>{});
  return()=>{active=false};
 },[id,name,teamLogoUrl,visible]);
 return <span ref={ref} className="stock-portrait" style={{width:size,height:size}}>{url&&!failed?<img src={url} alt={name} loading="lazy" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{name.split(' ').map(v=>v[0]).slice(0,2).join('')}</span>}</span>;
}
function PriceChart({history}:{history:History[]}){
 const [range,setRange]=useState<'1W'|'1M'|'3M'|'1Y'|'ALL'>('ALL');
 const [active,setActive]=useState<number|null>(null);
 const [fullScreen,setFullScreen]=useState(false);
 const [dragging,setDragging]=useState(false);
 const current=useMemo(()=>{
  const unique=new Map<string,History>();
  for(const row of history){
   const day=row.date?.slice(0,10);
   if(!day||!/^\\d{4}-\\d{2}-\\d{2}$/.test(day)||!Number.isFinite(row.value))continue;
   const gameId=row.gameId||day;
   if(!unique.has(gameId))unique.set(gameId,{...row,date:day});
  }
  return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId));
 },[history]);
 const filtered=useMemo(()=>{
  if(range==='ALL')return current;
  const days={'1W':7,'1M':30,'3M':90,'1Y':365}[range];
  // Use an exact calendar-day cutoff, not a time-of-day comparison to midnight.
  const now=new Date();
  const beginning=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()-days+1));
  const end=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()+1));
  return current.filter(h=>{
   const pointDate=new Date(h.date+'T00:00:00Z');
   return pointDate>=beginning&&pointDate<end;
  });
 },[current,range]);
 useEffect(()=>{setActive(null)},[range,history]);
 useEffect(()=>{
  if(!fullScreen)return;
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setFullScreen(false)};
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[fullScreen]);
 // One postgame price point per game. Each connecting segment uses exactly
 // the two dot prices shown in the selected-game detail panel.
 const games=filtered;
 const first=games[0]?.value??0,last=games[games.length-1]?.value??0;
 const overallDelta=last-first;
 const lineColor=overallDelta>=0?'#29d49f':'#fb6b83';
 const values=games.flatMap(g=>[g.value]);
 const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1;
 const padding=Math.max(.5,(max-min)*.12),bottom=min-padding,top=max+padding;
 const y=(n:number)=>222-(n-bottom)/(top-bottom)*186;
 const x=(i:number)=>games.length===1?350:65+i*565/(games.length-1);
 const selected=active!==null?games[active]:null;
 const previous=active!==null&&active>0?games[active-1]:null;
 const firstBefore=selected&&active===0?selected.priceBefore:null;
 const before=previous?.value??firstBefore;
 const diff=selected&&before!=null?selected.value-before:null;
 const chosenX=active!==null?x(active):0,chosenY=selected?y(selected.value):0;
 const closeFullscreen=()=>{setFullScreen(false);setDragging(false)};
 const onMove=(event:React.PointerEvent<SVGSVGElement>)=>{
  if(!games.length)return;
  const box=event.currentTarget.getBoundingClientRect();
  const px=(event.clientX-box.left)/box.width*650;
  let nearest=0,best=Infinity;
  games.forEach((_,i)=>{const distance=Math.abs(px-x(i));if(distance<best){best=distance;nearest=i}});
  setActive(nearest);
 };
 const moneyDelta=(v:number)=> (v>=0?'+':'−')+cash(Math.abs(v));
 const priceLabel=(v:number)=>'$'+v.toFixed(v>=1000?0:2);
 const renderChart=(expanded:boolean)=><div className="stock-chart" key={expanded?'full-chart-'+range:'modal-chart-'+range}>
  <div className="stock-chart-top"><div><span className="stock-overline">PRICE HISTORY</span><h3>{cash(last||null)} <small className={overallDelta>=0?'stock-up':'stock-down'}>{games.length&&first?percent((last/first-1)*100):'—'}</small></h3></div><div className="stock-time">{(['1W','1M','3M','1Y','ALL'] as const).map(r=><button key={r} className={r===range?'selected':''} onClick={()=>{setRange(r);setActive(null)}}>{r}</button>)}{!expanded&&<button className="stock-expand-button" onClick={()=>setFullScreen(true)} aria-label="Open full-screen stock price chart">⛶ Full screen</button>}</div></div>
  {games.length?<><svg key={range+(expanded?'-fullscreen':'-modal')} className="stock-interactive-chart" viewBox="0 0 650 270" role="img" aria-label="Touch or drag to inspect each game and its actual stock price movement" onPointerMove={onMove} onPointerDown={e=>{setDragging(true);e.currentTarget.setPointerCapture(e.pointerId);onMove(e)}} onPointerUp={e=>{setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>setDragging(false)} onPointerLeave={()=>{if(!dragging)setActive(null)}}>
   {[0,1,2,3,4].map(i=>{const value=top-(top-bottom)*i/4;const lineY=y(value);return <g key={i}><line x1="60" x2="638" y1={lineY} y2={lineY} stroke="#415573" strokeDasharray="3 5" strokeWidth="1"/><text x="53" y={lineY+4} textAnchor="end" fill="#91a9c7" fontSize="11">{priceLabel(value)}</text></g>})}
   {games.slice(1).map((g,offset)=>{
    const i=offset+1,prior=games[offset];
    return <line key={g.gameId+':line'} x1={x(offset)} y1={y(prior.value)} x2={x(i)} y2={y(g.value)} stroke={lineColor} strokeWidth={active===i?4:3} strokeLinecap="round"/>;
   })}
   {games.map((g,i)=>{
    return <circle key={g.gameId+':dot'} cx={x(i)} cy={y(g.value)} r={active===i?7:4} fill={lineColor} stroke="#0f1a2c" strokeWidth="1.5"/>;
   })}
   {selected&&<><line x1={chosenX} x2={chosenX} y1={16} y2={236} stroke="#c2d2e6" strokeWidth="1.5" strokeDasharray="4 5"/><circle cx={chosenX} cy={chosenY} r="7" fill={lineColor} stroke="#0f1a2c" strokeWidth="3"/></>}
   <text x="60" y="258" fill="#9aaec6" fontSize="11">{games[0].date.slice(0,10)}</text>
   <text x="638" y="258" fill="#9aaec6" textAnchor="end" fontSize="11">{games[games.length-1].date.slice(0,10)}</text>
   </svg>
   <div className="stock-game-inspector" aria-live="polite">
    {selected?<><div className="stock-game-header"><span>{selected.date.slice(0,10)}</span><b className={diff!==null&&diff>=0?'stock-up':'stock-down'}>{diff===null?'Price change unavailable':moneyDelta(diff)}</b></div>
     <div className="stock-game-line"><span>{selected.opponent?'vs '+selected.opponent:selected.event||'Game details unavailable'}</span><span>{selected.score||'Score unavailable'}</span>{selected.result&&<b className={selected.result==='W'?'stock-up':'stock-down'}>{selected.result}</b>}</div>
     <div className="stock-game-prices"><span>Before {cash(before??null)}</span><span>After {cash(selected.value)}</span></div>
    </>:<span className="stock-muted">Touch or drag across the price chart to inspect an individual game and its price movement. The chart is green when the stock gained value over this selected period and red when it lost value. Each dot represents one game.</span>}
   </div></>:<div className="stock-empty-chart">{current.length?<>No recorded stock price changes for this {range==='1W'?'week':range==='1M'?'month':range==='3M'?'three-month period':'year'}.<br/>Most recent recorded game: {current[current.length-1]?.date.slice(0,10)}.<br/>Select ALL to see earlier prices.</>:'No verified price-history events are published for this stock yet.'}</div>}
 </div>;
 return <>
  {renderChart(false)}
  {fullScreen&&<div className="stock-fullscreen-backdrop" role="presentation" onMouseDown={closeFullscreen}>
   <div className="stock-fullscreen-dialog" role="dialog" aria-modal="true" aria-label="Full-screen interactive stock price chart" onMouseDown={e=>e.stopPropagation()}>
    <div className="stock-fullscreen-header"><div><span className="stock-overline">SPATS STOCK EXCHANGE</span><h2>Interactive Price History</h2></div><button className="stock-fullscreen-close" onClick={closeFullscreen} aria-label="Close full-screen stock chart">✕</button></div>
    {renderChart(true)}
   </div>
  </div>}
 </>;
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
 {data&&<>{data.coverage&&<div className="stock-season-status"><b>2026–27 data coverage:</b> {data.coverage.teamGames.toLocaleString()} final D1 team games through {data.coverage.latestTeamGameDate||'unknown date'}; {data.coverage.playerCoveragePartial?'at least ':''}{data.coverage.playerGamesCovered.toLocaleString()} games with player box scores{data.coverage.playerCoveragePartial?' in the initial sample':''}. <span className="stock-muted">Counts indicate imports, not guaranteed completeness through today.</span></div>}<div className="stock-metrics"><div><span>TEAM STOCKS</span><strong>{data.teams.filter(x=>x.price!==null).length}</strong><small>Published team valuations</small></div><div><span>PLAYER DIRECTORY</span><strong>{data.players.length.toLocaleString()}</strong><small>2026–27 season records</small></div><div><span>PLAYER PRICES</span><strong>{pricedPlayers.toLocaleString()}</strong><small>{pricedPlayers?'Published valuations':'Pending V5 model'}</small></div><div><span>PRICED TEAM HIGH</span><strong>{cash(leaders[0]?.price)}</strong><small>{leaders[0]?.name||'No prices yet'}</small></div></div>
 {tab==='overview'&&<><div className="stocks-overview-grid"><section className="stock-panel"><div className="stock-panel-heading"><div><span className="stock-overline">MARKET LEADERS</span><h2>Highest-valued teams</h2></div><button className="stock-inline" onClick={()=>{setTab('teams');setMarket('team')}}>View all →</button></div><div className="stock-leaders">{leaders.map((t,i)=><button key={t.id} className="stock-leader" onClick={()=>open({...t,asset:'team'})}><span className="stock-place">{String(i+1).padStart(2,'0')}</span><Logo url={t.logoUrl} name={t.name}/><span className="stock-leader-name"><b>{t.name}</b><small>{t.conference||'Division I'}</small></span><strong>{cash(t.price)}</strong></button>)}{!leaders.length&&<p className="stock-muted">No published team prices returned.</p>}</div></section><section className="stock-panel stock-spotlight"><span className="stock-overline">PLAYER MARKET</span><div className="stock-spotlight-icon">↗</div><h2>Player stocks are coming online</h2><p>The player directory is linked to imported box scores. Stock opening prices and performance movements will appear when the V5 model is approved and published.</p><div className="stock-spotlight-count"><b>{data.players.length.toLocaleString()}</b><span>players in the directory</span></div><button onClick={()=>{setTab('players');setMarket('player')}} className="stock-action">Explore players →</button></section></div><section className="stock-panel"><div className="stock-panel-heading"><div><span className="stock-overline">STOCK RESEARCH</span><h2>Explore the entire market</h2></div><button className="stock-inline" onClick={()=>setTab('screener')}>Open screener →</button></div><p className="stock-muted">Filter by teams or players, sort published valuations, then open a stock to see game-by-game price history and performance trends.</p></section></>}
 {(tab==='screener'||tab==='teams'||tab==='players')&&<section className="stock-panel"><div className="stock-panel-heading"><div><span className="stock-overline">SPATS MARKET SCREENER</span><h2>{tab==='teams'?'Team stocks':tab==='players'?'Player stocks':'All stocks'}</h2></div><span className="stock-count">{rows.length.toLocaleString()} assets</span></div><div className="stock-filters"><input aria-label="Search players or teams" placeholder="Search players, schools, conferences…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter asset type" value={market} onChange={e=>setMarket(e.target.value as typeof market)}><option value="all">All assets</option><option value="team">Teams</option><option value="player">Players</option></select><select aria-label="Sort stocks" value={sort} onChange={e=>setSortBy(e.target.value as Sort)}><option value="price">Stock price</option><option value="name">Name</option><option value="change">Price change (loaded)</option></select><button className="stock-order" onClick={()=>setAscending(!ascending)} aria-label="Reverse sort">{ascending?'↑ Asc':'↓ Desc'}</button></div><div className="stock-table-scroll"><table className="stock-table"><thead><tr><th>Asset</th><th>Type</th><th>Team / Conference</th><th>Stock price</th><th>Games / PPG</th><th>Details</th></tr></thead><tbody>{rows.slice(0,300).map(s=><tr key={s.asset+s.id} onClick={()=>open(s)}><td><span className="stock-asset-cell">{s.asset==='team'?<Logo url={s.logoUrl} name={s.name}/>:<span className="stock-player-identity"><Portrait id={s.id} name={s.name} teamLogoUrl={data.teams.find(t=>t.id===s.teamId)?.logoUrl||null}/><Logo url={data.teams.find(t=>t.id===s.teamId)?.logoUrl||null} name={data.teams.find(t=>t.id===s.teamId)?.name||'Team'} size={21}/></span>}<span><b>{s.name}</b><small>{s.asset==='team'?s.conference:s.position||'Player'}</small></span></span></td><td><span className="stock-tag">{s.asset==='team'?'TEAM':'PLAYER'}</span></td><td>{s.asset==='team'?s.conference:(data.teams.find(t=>t.id===s.teamId)?.name||'—')}</td><td className="stock-price-cell">{cash(s.price)}</td><td>{s.asset==='team'?s.games.toLocaleString():(s.ppg?.toFixed(1)||'—')}</td><td><button className="stock-inline" onClick={e=>{e.stopPropagation();open(s)}}>Chart ↗</button></td></tr>)}</tbody></table></div>{rows.length>300&&<p className="stock-muted">Showing the first 300 matching assets. Refine your search to find more.</p>}{!rows.length&&<p className="stock-muted">No matching assets found.</p>}{data.playerWarning&&<p className="stock-muted">Player data: {data.playerWarning}</p>}</section>}
 </>}
 <p className="stock-disclaimer">SPATS stock values are simulated analytical indexes. Team prices are based on SPATS's proprietary performance model. Player values and top gainers / losers will populate only after verified pricing histories are published. Portraits and logos are best-effort and may fall back to initials.</p>
 {selected&&<div className="stocks-modal-backdrop" role="presentation" onMouseDown={()=>setSelected(null)}><div role="dialog" aria-modal="true" aria-label={selected.name+' stock details'} className="stocks-modal" onMouseDown={e=>e.stopPropagation()}><div className="stocks-modal-head"><div className="stocks-modal-person">{selected.asset==='team'?<Logo url={selected.logoUrl} name={selected.name} size={64}/>:<span className="stock-player-identity"><Portrait id={selected.id} name={selected.name} teamLogoUrl={data?.teams.find(t=>t.id===selected.teamId)?.logoUrl||null} size={64}/><Logo url={data?.teams.find(t=>t.id===selected.teamId)?.logoUrl||null} name={data?.teams.find(t=>t.id===selected.teamId)?.name||'Team'} size={28}/></span>}<div><span className="stock-overline">{selected.asset==='team'?'TEAM STOCK':'PLAYER STOCK'}</span><h2>{selected.name}</h2><span className="stock-muted">{selected.asset==='team'?selected.conference:(data?.teams.find(t=>t.id===selected.teamId)?.name||selected.position)}</span></div></div><button className="stocks-close" onClick={()=>setSelected(null)} aria-label="Close details">✕</button></div><div className="stock-detail-metrics"><div><span>STOCK PRICE</span><strong>{cash(selected.price)}</strong></div><div><span>{selected.asset==='team'?'GAMES ANALYZED':'POINTS / GAME'}</span><strong>{selected.asset==='team'?selected.games.toLocaleString():(selected.ppg?.toFixed(1)||'—')}</strong></div><div><span>GAMES PROCESSED</span><strong>{selected.games??'—'}</strong></div></div>{historyLoading?<p className="stock-muted">Loading stock history…</p>:<PriceChart history={history}/>}<div className="stock-modal-foot"><span>Historical movements are calculated from recorded games and model events.</span><button onClick={()=>setSelected(null)}>Close</button></div></div></div>}
 </main>;
}
