import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../app/globals.css';
import Header from '../components/Header';
import MobileBottomNavPages from '../components/MobileBottomNavPages';
import ThemeApplier from '../components/ThemeApplier';
import { WalletProvider } from '../context/WalletContext';

export default function App({ Component, pageProps }: AppProps) {
    return (
        <WalletProvider>
            <Head>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <ThemeApplier />
            <div className="relative z-10 min-h-screen overflow-x-hidden">
                <Header />

                <Component {...pageProps} />
            </div>

            <MobileBottomNavPages />
        </WalletProvider>
    );
}
