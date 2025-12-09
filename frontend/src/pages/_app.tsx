import type { AppProps } from 'next/app';
import '../app/globals.css';
import Header from '../components/Header';

export default function App({ Component, pageProps }: AppProps) {
    return (
        <div className="relative min-h-screen bg-[#0B0C10] text-[#E5E5E5] overflow-x-hidden">
            <Header />
            
            {/* Glowing rope & aurora */}
            <div className="hero-gradient-rope"></div>
            <div className="hero-aurora"></div>
            
            <Component {...pageProps} />
        </div>
    );
}
