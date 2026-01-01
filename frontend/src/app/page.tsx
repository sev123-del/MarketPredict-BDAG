"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from 'next/link';
import { ethers } from "ethers";
import logger from "../lib/logger";

interface TopMarket {
  id: number;
  question: string;
  totalPool: number;
  yesPercent: number;
  noPercent: number;
  closeTime: string;
  status: number;
}

export default function Home() {
  const [topMarkets, setTopMarkets] = useState<TopMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const lastStartMsRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadTopMarkets = async (opts?: { force?: boolean }) => {
    const now = Date.now();
    const minGapMs = 1500;
    if (!opts?.force) {
      if (inFlightRef.current) return;
      if (now - lastStartMsRef.current < minGapMs) return;
    }

    try {
      inFlightRef.current = true;
      lastStartMsRef.current = now;
      setErrorMessage(null);

      // Cancel any previous in-flight request (e.g., rapid clicks)
      try {
        abortRef.current?.abort();
      } catch { }
      const controller = new AbortController();
      abortRef.current = controller;

      // Fetch top markets from server-side API; use the lightweight cached endpoint
      const res = await fetch('/api/top-markets', { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // If server provides a detail (dev) surface it; otherwise show generic message
        const detail = data?.detail || data?.error || 'Failed to load markets';
        setErrorMessage(String(detail));
        setLoading(false);
        return;
      }
      const apiMarkets = data.markets || [];

      const topList: TopMarket[] = [];
      for (let i = 0; i < apiMarkets.length; i++) {
        try {
          const m = apiMarkets[i];
          const yesPool = Number(ethers.formatEther(m.yesPool || '0'));
          const noPool = Number(ethers.formatEther(m.noPool || '0'));
          const totalPool = yesPool + noPool;
          const status = Number(m.status || 0);

          if (status === 0 && totalPool > 0) {
            const closeTimestamp = Number(m.closeTime || 0) * 1000;
            const now = Date.now();

            if (closeTimestamp > now) {
              topList.push({
                id: Number(m.id ?? i),
                question: String(m.question ?? ""),
                totalPool,
                yesPercent: totalPool > 0 ? (yesPool / totalPool) * 100 : 50,
                noPercent: totalPool > 0 ? (noPool / totalPool) * 100 : 50,
                closeTime: new Date(closeTimestamp).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                }),
                status
              });
            }
          }
        } catch {
          logger.warn(`Market ${i} not accessible`);
        }
      }

      topList.sort((a, b) => b.totalPool - a.totalPool);
      setTopMarkets(topList.slice(0, 3));
    } catch (err) {
      // Ignore aborts (we intentionally abort on fast retries)
      if (String((err as any)?.name || '').toLowerCase().includes('abort')) return;
      logger.error('Error loading markets:', err);
      setErrorMessage(String(err || 'Unknown error'));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopMarkets();
    const interval = setInterval(loadTopMarkets, 10000);
    return () => {
      clearInterval(interval);
      try {
        abortRef.current?.abort();
      } catch { }
    };
  }, []);

  return (
    <>
      {/* Rope aesthetic: homepage only, desktop/large screens only */}
      <div className="hidden lg:block hero-gradient-rope" />
      <div className="hidden lg:block hero-aurora" />

      <main className="min-h-screen flex flex-col items-center text-center px-4 pb-24 lg:pb-0 relative z-10">
        {/* Hero Text */}
        <h1 className="hero-title mt-12 mb-2">Predict the Future with Confidence</h1>
        <p className="hero-subtitle mb-3">
          Join the World&apos;s Prediction Revolution — Powered by BlockDAG
        </p>

        {/* Live Markets badge moved to header */}

        {/* Top 3 Highest Pool Markets */}
        <section style={{ marginTop: '0.5in' }} className="z-10 w-full max-w-6xl flex flex-col gap-10 mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="text-[#00FFA3] text-xl animate-pulse">
              🔄 Loading top markets...
            </div>
          ) : errorMessage ? (
            <div className="max-w-3xl mx-auto bg-red-800/20 border border-red-600 p-4 rounded">
              <div className="flex items-start justify-between gap-4">
                <div className="text-left">
                  <p className="font-bold text-red-300">Failed to load top markets</p>
                  <p className="text-sm text-red-200/90 mt-1">{errorMessage}</p>
                </div>
                <div>
                  <button
                    onClick={() => {
                      setLoading(true);
                      setErrorMessage(null);
                      loadTopMarkets({ force: true });
                    }}
                    className="btn-glow text-sm px-3 py-2"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          ) : topMarkets.length === 0 ? (
            <div className="mp-text-muted">
              <Link href="/markets" className="btn-glow inline-block">
                View All Markets
              </Link>
            </div>
          ) : (
            <>
              {/* Rank Badges */}
              <div className="flex flex-wrap justify-center gap-8">
                {topMarkets.slice(0, 3).map((market) => {
                  const yesPercentage = Math.round(market.yesPercent);
                  const noPercentage = Math.round(market.noPercent);
                  const yesPool = market.totalPool * (market.yesPercent / 100);
                  const noPool = market.totalPool * (market.noPercent / 100);

                  const boundary = Math.max(0, Math.min(100, yesPercentage));
                  const blendHalf = 1.5; // percent on each side of boundary
                  const blendStart = Math.max(0, Math.min(100, boundary - blendHalf));
                  const blendEnd = Math.max(0, Math.min(100, boundary + blendHalf));
                  const blendWidth = Math.max(0, blendEnd - blendStart);

                  let yesOdds = "∞";
                  let noOdds = "∞";
                  if (yesPool > 0) yesOdds = (market.totalPool / (yesPool + 1)).toFixed(2);
                  if (noPool > 0) noOdds = (market.totalPool / (noPool + 1)).toFixed(2);

                  return (
                    <div key={market.id} className="relative w-full max-w-105 mx-auto">
                      {/* badge removed */}

                      <Link
                        href={`/market/${market.id}`}
                        aria-label={`Open market ${market.id}: ${market.question}`}
                        className={`market-box market-box--content turquoise w-full hover:scale-105 transition-all duration-300 cursor-pointer relative group mt-2`}
                      >
                        <div className={`absolute inset-0 bg-linear-to-r from-[#00FFA3]/0 via-[#00FFA3]/20 to-[#00FFA3]/0 opacity-0 group-hover:opacity-100 group-hover:animate-pulse transition-opacity`} />

                        <p className="text-lg font-bold mb-8 line-clamp-3 relative z-10">
                          {market.question}
                        </p>

                        {/* Visual Progress Bar with Live Odds (matched to market detail page) */}
                        <div className="mt-4">
                          <div className="flex justify-between items-center mb-2 text-xs font-bold">
                            <span style={{ color: '#00FFA3' }}>YES Odds: {yesOdds}x</span>
                            <span style={{ color: '#ef4444' }}>NO Odds: {noOdds}x</span>
                          </div>
                          <div
                            className="h-6 rounded-full overflow-hidden flex relative"
                            style={{
                              background: 'var(--mp-surface)',
                              boxShadow: '0 0 20px rgba(0,196,186,0.3) inset'
                            }}
                          >
                            <div
                              className="transition-all duration-500 flex items-center justify-center text-xs font-bold"
                              style={{
                                width: `${yesPercentage}%`,
                                background: 'linear-gradient(90deg, #00FFA3 0%, #00C4BA 100%)',
                                color: '#0B0C10',
                                boxShadow: '0 0 15px rgba(0,255,163,0.6)'
                              }}
                            >
                              {yesPercentage > 15 && `${yesPercentage.toFixed(0)}%`}
                            </div>
                            <div
                              className="transition-all duration-500 flex items-center justify-center text-xs font-bold"
                              style={{
                                width: `${noPercentage}%`,
                                background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
                                color: '#ffffff',
                                boxShadow: '0 0 15px rgba(239,68,68,0.6)'
                              }}
                            >
                              {noPercentage > 15 && `${noPercentage.toFixed(0)}%`}
                            </div>

                            {blendWidth > 0 && blendWidth < 100 && (
                              <div
                                aria-hidden="true"
                                className="absolute top-0 bottom-0 pointer-events-none"
                                style={{
                                  left: `${blendStart}%`,
                                  width: `${blendWidth}%`,
                                  background: 'linear-gradient(90deg, rgba(0,196,186,0.95) 0%, rgba(239,68,68,0.95) 100%)',
                                }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Pool Display */}
                        <div className="rounded-lg p-3 mb-3 relative z-10" style={{ background: 'var(--mp-surface)' }}>
                          <div className={`text-[#00FFA3] font-bold text-2xl`}>
                            💰 {market.totalPool.toFixed(4)} BDAG
                          </div>
                        </div>

                        <div className="relative z-10">
                          <span className="btn-glow inline-block">Predict It! </span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>


            </>
          )}
        </section>

        {/* Action Buttons */}
        <div className="mt-20 flex flex-wrap justify-center gap-6">
          <Link href="/markets" className="btn-glow text-lg px-8 py-4">
            🌐 Explore All Markets
          </Link>
          <Link href="/wallet" className="btn-glow text-lg px-8 py-4">
            💰 Fund Your Account
          </Link>
        </div>

        {/* Stats & Security Info */}
        <div className="mt-16 text-center mp-text-muted text-sm max-w-3xl space-y-2">
          <p className="text-base">
            🔒 Secured by BlockDAG Network | Fair Parimutuel System | ⚡ Only 2.9% Platform Fee on Winnings
          </p>
        </div>
      </main>
    </>
  );
}