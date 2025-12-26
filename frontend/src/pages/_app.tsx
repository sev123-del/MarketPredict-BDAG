import type { AppProps } from 'next/app';
import '../app/globals.css';
import Header from '../components/Header';
import { WalletProvider } from '../context/WalletContext';

export default function App({ Component, pageProps }: AppProps) {
    return (
        <WalletProvider>
            <div className="relative z-10 min-h-screen bg-[#0B0C10] text-[#E5E5E5] overflow-x-hidden">
                <Header />

                {/* Glowing rope & aurora */}
                <div className="hero-gradient-rope"></div>
                <div className="hero-aurora"></div>

                <Component {...pageProps} />
            </div>
        </WalletProvider>
    );
}
