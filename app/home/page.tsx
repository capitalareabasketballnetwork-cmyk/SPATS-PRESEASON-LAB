import Link from 'next/link';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'SPATS | Sports Analytics at WMU',description:'NFL, College Football, College Basketball and NBA analytics model labs at Western Michigan University'};
const sports=[
 {href:'/football',icon:'🏈',eyebrow:'NFL',title:'NFL Model Lab',desc:'Historical football modeling, odds calculator, AI Model Advisor, and upcoming games.'},
 {href:'/college-football',icon:'🏈',eyebrow:'NCAA FOOTBALL',title:'College Football Model Lab',desc:'FBS and FCS game predictions, custom weights, historical backtesting and upcoming games.'},
 {href:'/college-basketball',icon:'🏀',eyebrow:'NCAA MEN’S BASKETBALL',title:'College Basketball Model Lab',desc:'Division I game models, team trends, model comparison and historical performance.'},
 {href:'/nba',icon:'🏀',eyebrow:'PRO BASKETBALL',title:'NBA Model Lab',desc:'NBA game predictions, historical results, custom model weights and game explorer.'},
 {href:'/',icon:'🏆',eyebrow:'SPATS CLUB',title:'College Basketball Rankings',desc:'Live Top 25 voting, player ratings, team research and collaborative club sessions.'}
];
export default function ClubHome(){return <main className="spats-home"><section className="hero"><div className="eyebrow">WESTERN MICHIGAN UNIVERSITY · SPORTS ANALYTICS</div><h1>SPATS <em>Model Hub</em></h1><p>Build, test and compare sports prediction models. Explore the NFL, College Football, College Basketball, NBA, and our club ranking lab.</p></section><section className="spats-sport-cards">{sports.map(s=><Link key={s.href} href={s.href} className="spats-sport-card"><span className="spats-sport-icon">{s.icon}</span><div className="eyebrow">{s.eyebrow}</div><h2>{s.title}</h2><p>{s.desc}</p><strong>Open {s.eyebrow} →</strong></Link>)}</section></main>}