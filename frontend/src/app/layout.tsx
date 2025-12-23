'use client';
import "./globals.css";
import Header from "../components/Header";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" />
      </head>
      <body className="relative z-10 min-h-screen bg-[#0B0C10] text-[#E5E5E5] overflow-x-hidden">
        <Header />

        {/* Glowing rope & aurora */}
        <div className="hero-gradient-rope"></div>
        <div className="hero-aurora"></div>

        {children}
      </body>
    </html>
  );
}
