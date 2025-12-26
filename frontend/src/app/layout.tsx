
import "./globals.css";
import Header from "../components/Header";
import { headers } from 'next/headers';
import { WalletProvider } from '../context/WalletContext';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the nonce set by middleware when CSP_STRICT=true. This is exposed
  // on the incoming request headers as `x-csp-nonce` so server-rendered pages
  // can include it in inline scripts where necessary.
  let nonce: string | null = null;
  try {
    const h = await headers();
    nonce = typeof h.get === 'function' ? h.get('x-csp-nonce') : null;
  } catch {
    nonce = null;
  }

  return (
    <html lang="en">
      <head>
        {/*
          Content-Security-Policy should be delivered via HTTP response headers
          (server / host) rather than a meta tag. Middleware will set per-request
          nonces when `CSP_STRICT=true` and expose the nonce via the
          `x-csp-nonce` header for server components to use.
        */}
        {nonce ? <meta name="csp-nonce" content={nonce} /> : null}
      </head>
      <body className="relative z-10 min-h-screen bg-[#0B0C10] text-[#E5E5E5] overflow-x-hidden">
        <WalletProvider>
          <Header />

          {/* Glowing rope & aurora */}
          <div className="hero-gradient-rope"></div>
          <div className="hero-aurora"></div>

          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
