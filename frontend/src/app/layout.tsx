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
      <body className="relative min-h-screen bg-[#0B0C10] text-[#E5E5E5] overflow-x-hidden">
        <Header />

        {/* Glowing rope & aurora */}
        <div className="hero-gradient-rope"></div>
        <div className="hero-aurora"></div>

        {children}
      </body>
    </html>
  );
}
