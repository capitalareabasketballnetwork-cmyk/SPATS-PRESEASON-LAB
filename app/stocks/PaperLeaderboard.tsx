'use client';
import {useEffect,useMemo,useState} from 'react';
import {db} from '../../lib/supabase';
import {usd} from './PaperExchange';

type RankRow={user_id:string;username:string;portfolio_value:number;cash:number;holdings_value:number;total_profit_loss:number;holdings_count:number};

export default function PaperLeaderboard({currentUsername,cloudEnabled}:{currentUsername:string;cloudEnabled:boolean}){
 const [rows,setRows]=useState<RankRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [search,setSearch]=useState('');
 const [username,setUsername]=useState(currentUsername);
 const [editing,setEditing]=useState(false);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>setUsername(currentUsername),[currentUsername]);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   setLoading(true);setError('');
   if(!db){if(live){setError('Supabase is not connected.');setLoading(false)}return}
   const {data,error:err}=await db.rpc('spats_paper_leaderboard');
   if(!live)return;
   if(err){setError('Cloud leaderboard is not active yet. Install the SPATS cloud paper exchange migration in Supabase to display signed-in users and actual portfolios.');setRows([])}
   else setRows(((data||[]) as RankRow[]).map(row=>({...row,portfolio_value:Number(row.portfolio_value),cash:Number(row.cash),holdings_value:Number(row.holdings_value),total_profit_loss:Number(row.total_profit_loss),holdings_count:Number(row.holdings_count)})));
   setLoading(false);
  };
  void load();
  return()=>{live=false};
 },[refresh,cloudEnabled]);
 const displayed=useMemo(()=>rows.filter(r=>r.username.toLowerCase().includes(search.trim().toLowerCase())),[rows,search]);
 const ranked=useMemo(()=>[...rows].sort((a,b)=>b.portfolio_value-a.portfolio_value||a.username.localeCompare(b.username)),[rows]);
 const rankByUser=new Map(ranked.map((r,i)=>[r.user_id,i+1]));
 async function saveName(e:React.FormEvent){
  e.preventDefault();if(!db||!cloudEnabled)return;
  setSaving(true);setNotice('');
  const {error:err}=await db.rpc('spats_paper_set_username',{p_username:username.trim()});
  setSaving(false);
  if(err){setNotice(err.message);return}
  setEditing(false);setNotice('Username updated successfully.');setRefresh(v=>v+1);
 }
 return <section className="stock-panel stock-paper-leaderboard">
  <div className="stock-panel-heading stock-paper-board-heading">
   <div><span className="stock-overline">SPATS PAPER EXCHANGE · SEASON RANKINGS</span><h2>Trading Leaderboard</h2><p className="stock-muted">All registered SPATS accounts, ranked by cash plus the latest published value of their shares. Everyone starts with $10,000 in virtual cash.</p></div>
   <button className="stock-inline" onClick={()=>setRefresh(v=>v+1)}>↻ Refresh rankings</button>
  </div>
  {cloudEnabled&&<div className="stock-board-profile"><div><span className="stock-overline">YOUR TRADER USERNAME</span><strong>@{currentUsername}</strong></div><button onClick={()=>{setEditing(v=>!v);setUsername(currentUsername)}}>{editing?'Cancel':'Change username'}</button></div>}
  {editing&&cloudEnabled&&<form className="stock-board-name-form" onSubmit={saveName}><label>Choose a public trader username (3–24 characters)</label><div><input value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]{2,23}" required/><button disabled={saving}>{saving?'Saving…':'Save username'}</button></div></form>}
  {notice&&<p className="stocks-notice" role="status">{notice}</p>}
  {error&&<div className="stock-price-history-notice">{error}<p>No placeholder accounts or balances are shown.</p></div>}
  {loading?<p className="stock-muted">Loading portfolio standings…</p>:!error&&<>
   <div className="stock-board-podium">
    {ranked.slice(0,3).map((r,i)=><div className={'stock-board-medal medal-'+(i+1)} key={r.user_id}><span className="stock-board-rank">{['🥇','🥈','🥉'][i]}</span><strong>@{r.username}</strong><b>{usd(r.portfolio_value)}</b><small className={r.total_profit_loss>=0?'stock-up':'stock-down'}>{r.total_profit_loss>=0?'+':''}{usd(r.total_profit_loss)} overall</small></div>)}
   </div>
   <div className="stock-board-toolbar"><div><strong>{ranked.length.toLocaleString()} traders</strong><small>Prices update with the SPATS team and published player models.</small></div><input aria-label="Search leaderboard usernames" placeholder="Search usernames…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <div className="stock-table-scroll"><table className="stock-table"><thead><tr><th>Rank</th><th>Username</th><th>Portfolio value</th><th>Available cash</th><th>Stock holdings</th><th>Total P/L</th></tr></thead><tbody>
    {displayed.map(r=><tr key={r.user_id}><td><strong>#{rankByUser.get(r.user_id)}</strong></td><td><strong>@{r.username}</strong></td><td className="stock-price-cell">{usd(r.portfolio_value)}</td><td>{usd(r.cash)}</td><td>{usd(r.holdings_value)} <small className="stock-muted">({r.holdings_count})</small></td><td className={r.total_profit_loss>=0?'stock-up':'stock-down'}>{r.total_profit_loss>=0?'+':''}{usd(r.total_profit_loss)}</td></tr>)}
   </tbody></table></div>
   {!displayed.length&&<p className="stock-muted">No usernames match the search.</p>}
  </>}
  <p className="stock-disclaimer">Simulation only. Portfolio value is marked to the latest published model price; browser-only paper portfolios are not included. No cash-out or real-money transactions.</p>
 </section>;
}
