import './globals.css';
import './club.css';
import SportsNav from './sports-nav';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'SPATS | Sports Analytics at WMU',description:'SPATS multi-sport model hub: college basketball rankings, football prediction models, and sports analytics at Western Michigan University'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><SportsNav/>{children}</body></html>}
