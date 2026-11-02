'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import readXlsxFile from 'read-excel-file';

type Entry={rank:number;team:string;detail:string};
const W=1080,H=1350;
const cut=(s:string,n:number)=>s.length>n?s.slice(0,n-1)+'…':s;
function draw(canvas:HTMLCanvasElement,entries:Entry[],headline:string,subtitle:string,accent:string){
 const c=canvas.getContext('2d');if(!c)return;canvas.width=W;canvas.height=H;
 const bg=c.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#0a1328');bg.addColorStop(.56,'#14213c');bg.addColorStop(1,'#081324');c.fillStyle=bg;c.fillRect(0,0,W,H);
 c.globalAlpha=.16;c.fillStyle=accent;c.beginPath();c.arc(1000,120,420,0,Math.PI*2);c.fill();c.beginPath();c.arc(0,1260,350,0,Math.PI*2);c.fill();c.globalAlpha=1;
 c.fillStyle=accent;c.fillRect(72,72,75,8);c.fillStyle='#b6c6df';c.font='bold 27px Arial';c.fillText('SPATS  /  COLLEGE BASKETBALL',72,123);
 c.fillStyle='#fff';c.font='bold 68px Arial';c.fillText(cut(headline,27),72,211);
 c.fillStyle='#b5c8e0';c.font='29px Arial';c.fillText(cut(subtitle,52),74,259);
 const count=Math.min(entries.length,25),cols=count>13?2:1,per=Math.ceil(count/cols),rowH=Math.min(75,Math.floor(910/Math.max(per,1))),top=315,colW=cols===2?460:936;
 entries.slice(0,25).forEach((e,i)=>{const col=Math.floor(i/per),row=i%per,x=72+col*(colW+16),y=top+row*(rowH+6);
 c.fillStyle='rgba(255,255,255,.075)';c.beginPath();c.roundRect(x,y,colW,rowH,12);c.fill();
 c.fillStyle=i<3?accent:'#93aacb';c.font='bold '+(cols===2?24:28)+'px Arial';c.fillText(String(e.rank).padStart(2,'0'),x+17,y+rowH*.64);
 c.fillStyle='#fff';c.font='bold '+(cols===2?21:28)+'px Arial';c.fillText(cut(e.team,cols===2?23:43),x+75,y+rowH*.62);
 if(e.detail){c.fillStyle='#b6c8de';c.font='19px Arial';c.textAlign='right';c.fillText(cut(e.detail,cols===2?10:22),x+colW-18,y+rowH*.64);c.textAlign='left'}
 });
 c.fillStyle=accent;c.fillRect(72,1260,936,2);c.fillStyle='#dce8f8';c.font='bold 27px Arial';c.fillText('SPORTS ANALYTICS AT WMU',72,1308);c.fillStyle='#a9b9d0';c.font='22px Arial';c.textAlign='right';c.fillText('SPATSCLUB.COM',1008,1308);c.textAlign='left';
}
export default function InstagramMaker(){
 const [entries,setEntries]=useState<Entry[]>([]),[headline,setHeadline]=useState('SPATS TOP 25'),[subtitle,setSubtitle]=useState('College Basketball Rankings'),[accent,setAccent]=useState('#5ac8fa'),[message,setMessage]=useState('Upload an Excel workbook with a Team column. Optional columns: Rank, Record, Score, or Rating.'),[sheet,setSheet]=useState('');const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{if(canvas.current)draw(canvas.current,entries,headline,subtitle,accent)},[entries,headline,subtitle,accent]);
 const upload=async(file?:File)=>{if(!file)return;setMessage('Reading workbook…');try{
 const rows=await readXlsxFile(file);if(!rows.length)throw Error('The first worksheet is empty.');
 const strings=rows.map(r=>r.map(x=>x==null?'':String(x).trim()));const headers=strings[0].map(x=>x.toLowerCase());
 const teamIndex=headers.findIndex(x=>/^(team|school|university|team name)$/.test(x));const rankIndex=headers.findIndex(x=>/^(rank|ranking|position|#)$/.test(x));const detailIndex=headers.findIndex(x=>/^(record|rating|score|points|value|power rating)$/.test(x));
 const start=teamIndex>=0?1:0;const ti=teamIndex>=0?teamIndex:(rankIndex===0?1:0);
 const parsed=strings.slice(start).filter(r=>r[ti]&&r[ti].length>1).map((r,i)=>({rank:rankIndex>=0&&Number(r[rankIndex])>0?Number(r[rankIndex]):i+1,team:r[ti],detail:detailIndex>=0?r[detailIndex]||'':''})).sort((a,b)=>a.rank-b.rank).slice(0,25);
 if(!parsed.length)throw Error('No team names found. Use a Team column in the first worksheet.');
 setEntries(parsed);setSheet(file.name);setMessage('Loaded '+parsed.length+' teams. Customize the graphic and export your PNG.');
 }catch(e){setMessage(e instanceof Error?e.message:'Could not read workbook. Upload a valid .xlsx file.')}};
 const exportPng=()=>{const c=canvas.current;if(!c)return;const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='spats-cbb-rankings.png';a.click()};
 return <main style={{maxWidth:1200,margin:'0 auto',padding:'32px 20px 70px',color:'#f4f8ff'}}>
 <Link href="/" style={{color:'#93d9ff'}}>← Back to CBB Rankings</Link>
 <h1 style={{fontSize:40,margin:'18px 0 8px'}}>Instagram Post Studio</h1><p style={{color:'#b7c9e4'}}>Turn your college basketball rankings spreadsheet into a polished 1080 × 1350 Instagram graphic.</p>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,360px),1fr))',gap:28,alignItems:'start'}}>
 <section style={{background:'#14233d',padding:24,borderRadius:18}}>
 <h2>1. Import rankings</h2><label style={{display:'block',padding:20,border:'2px dashed #5985b1',borderRadius:12,marginBottom:12}}>Excel file (.xlsx)<input type="file" accept=".xlsx" onChange={e=>void upload(e.target.files?.[0])} style={{display:'block',marginTop:12,maxWidth:'100%'}}/></label><p style={{color:'#b7c9e4',fontSize:14}} role="status">{message}</p>{sheet&&<p style={{fontSize:13}}>File: {sheet}</p>}
 <h2 style={{marginTop:28}}>2. Customize</h2>
 <label style={{display:'block',marginBottom:14}}>Headline<input style={{display:'block',width:'100%',padding:12,marginTop:6}} value={headline} maxLength={35} onChange={e=>setHeadline(e.target.value)}/></label>
 <label style={{display:'block',marginBottom:14}}>Subtitle<input style={{display:'block',width:'100%',padding:12,marginTop:6}} value={subtitle} maxLength={60} onChange={e=>setSubtitle(e.target.value)}/></label>
 <label style={{display:'flex',alignItems:'center',gap:12}}>Accent color<input aria-label="Accent color" type="color" value={accent} onChange={e=>setAccent(e.target.value)}/></label>
 <p style={{color:'#aebed6',fontSize:13,marginTop:20}}>The first worksheet is used. Columns can include Team, Rank and Record or Rating. Up to 25 teams are shown.</p>
 <button type="button" onClick={exportPng} disabled={!entries.length} style={{width:'100%',background:accent,color:'#071426',border:0,borderRadius:12,padding:16,fontWeight:800,fontSize:17,cursor:entries.length?'pointer':'not-allowed',marginTop:12}}>↓ Export Instagram PNG</button>
 </section>
 <section><h2 style={{marginTop:0}}>Live preview</h2><canvas ref={canvas} aria-label="Instagram rankings graphic preview" style={{display:'block',width:'100%',maxWidth:540,height:'auto',borderRadius:14,boxShadow:'0 20px 60px rgba(0,0,0,.35)'}}/><p style={{color:'#aebed6',fontSize:13}}>Your spreadsheet is processed in your browser and is not uploaded to a server.</p></section>
 </div></main>;
}
