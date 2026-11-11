'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {db} from '../../../lib/supabase';
import PaperLeaderboard from '../PaperLeaderboard';
import '../stocks.css';

export default function StocksLeaderboardPage(){
 const [username,setUsername]=useState('');
 const [cloud,setCloud]=useState(false);
 useEffect(()=>{
  let live=true;
  (async()=>{
   if(!db)return;
   const {data,error}=await db.rpc('spats_paper_my_account');
   if(live&&!error&&data){const account=data as {username?:string};setUsername(account.username||'');setCloud(true)}
  })();
  return()=>{live=false};
 },[]);
 return <main className="stocks-page">
  <div className="stocks-top"><div><span className="stock-overline">SPATS · COLLEGE BASKETBALL STOCK EXCHANGE</span><h1>Portfolio <em>Leaderboard</em></h1><p>Compete with SPATS traders using simulated money. Rankings are based on each account's current portfolio value.</p></div>
   <Link href="/stocks" className="stock-paper-board-back">← Back to Stock Exchange</Link>
  </div>
  <PaperLeaderboard cloudEnabled={cloud} currentUsername={username}/>
 </main>;
}
