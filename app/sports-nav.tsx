'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
const sections=[{label:'SPATS Home',href:'/home'},{label:'College Basketball',href:'/'},{label:'Football Model',href:'/football'}];
export default function SportsNav(){
 const pathname=usePathname();
 const active=(href:string)=>href==='/'?(pathname==='/'||pathname.startsWith('/live-results')):pathname===href||pathname.startsWith(href+'/');
 return <div className="sports-nav-shell"><nav className="sports-nav" aria-label="SPATS sports and models"><Link className="sports-nav-brand" href="/home">SPATS <span>Sports Analytics at WMU</span></Link><div className="sports-nav-links">{sections.map(s=><Link key={s.href} href={s.href} className={'sports-nav-link'+(active(s.href)?' is-current':'')} aria-current={active(s.href)?'page':undefined}>{s.label}</Link>)}</div></nav></div>;
}
