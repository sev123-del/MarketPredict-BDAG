// frontend/src/pages/markets.tsx
import { useEffect, useState } from "react";
import Link from 'next/link';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

const OWNER_ADDRESS = "0x539bAA99044b014e453CDa36C4AD3dE5E4575367".toLowerCase();

// BDAG Testnet configuration
const BDAG_TESTNET = {
  chainId: '0x413',
  chainName: 'BDAG Testnet',
  nativeCurrency: {
    name: 'BDAG',
    symbol: 'BDAG',
    decimals: 18
  },
  rpcUrls: [''],
  blockExplorerUrls: ['https://explorer.testnet.blockdag.network']
};

// Category constants matching create-market
const CATEGORIES = [
  "All Categories",
  "Finance",
  "Crypto",
  "World",
  "Entertainment",
  "Tech",
  "Weather",
  "General"
];

// Helper: safely convert returned pool values to ether-decimal strings
function safeFormatEther(value: any): string {
  if (value === null || value === undefined) return '0';
  const s = String(value);

  // If looks like integer wei (digits only and reasonably long), try formatEther
  if (/^\d+$/.test(s) && s.length >= 13) {
    try {
      return ethers.formatEther(s);
    } catch (_e) {
      // fallthrough
    }
  }

  // If it's a decimal string or number, return numeric string
  const n = Number(s);
  if (!isNaN(n)) return String(n);

  return '0';
}

interface Market {
  id: number;
  question: string;
  endTime: string;
  yesPool: string;
  noPool: string;
  creator: string;
  category: string;
  status: number;
  closeTimestamp: number;
}

function MarketCard({ market }: { market: Market }) {
  const handleClick = () => {
    window.location.href = `/market/${market.id}`;
  };

  const totalPool = parseFloat(market.yesPool) + parseFloat(market.noPool);
  const yesOdds = totalPool > 0 ? ((parseFloat(market.yesPool) / totalPool) * 100).toFixed(1) : "50";
  const noOdds = totalPool > 0 ? ((parseFloat(market.noPool) / totalPool) * 100).toFixed(1) : "50";

  const isExpired = market.closeTimestamp < Date.now();
  const isResolved = market.status === 1;
  const isCancelled = market.status === 2;

  return (
    <div
      className={`market-card w-full max-w-[420px] mx-auto p-6 bg-[#1a1d2e] border-2 rounded-lg cursor-pointer transition-all hover:shadow-[0_0_25px_rgba(0,255,163,0.4)] relative overflow-hidden group ${isExpired || isResolved || isCancelled
        ? 'border-[#E5E5E5]/20 opacity-60'
        : 'border-[#00FFA3]/30 hover:border-[#00FFA3] hover:scale-105'
        }`}
      onClick={handleClick}
    >
      {/* Animated glow effect on hover */}
      {!isExpired && !isResolved && !isCancelled && (
        <div className="absolute inset-0 bg-gradient-to-r from-[#00FFA3]/0 via-[#00FFA3]/10 to-[#00FFA3]/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}

      {/* Status badges */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 items-end z-10">
        {market.category && market.category !== "Other" && (
          <span className="text-xs bg-[#0072FF]/20 text-[#0072FF] px-2 py-1 rounded-full font-bold border border-[#0072FF]/30">
            {market.category}
          </span>
        )}
        {isResolved && (
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full font-bold animate-pulse">
            ✅ Resolved
          </span>
        )}
        {isCancelled && (
          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-full font-bold">
            ❌ Cancelled
          </span>
        )}
        {isExpired && !isResolved && !isCancelled && (
          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full font-bold">
            ⏰ Expired
          </span>
        )}
      </div>

      <h3 className="text-lg font-bold text-[#00FFA3] mb-4 line-clamp-2 pr-20 relative z-10">
        {market.question}
      </h3>

      {/* Pool and odds display */}
      <div className="mb-4 relative z-10">
        <div className="text-sm text-[#E5E5E5]/60 mb-3 font-bold">
          💰 Total Pool: {totalPool.toFixed(4)} BDAG
        </div>
        <div className="flex gap-2">
          <div className="flex-1 p-3 bg-[#0B0C10] rounded-lg border-2 border-green-500/50 hover:border-green-500 transition-colors">
            <div className="text-xs text-green-400 mb-1 font-bold">✅ YES</div>
            <div className="text-xl font-bold text-green-400">{yesOdds}%</div>
            <div className="text-xs text-[#E5E5E5]/50 mt-1">{parseFloat(market.yesPool).toFixed(4)} BDAG</div>
          </div>
          <div className="flex-1 p-3 bg-[#0B0C10] rounded-lg border-2 border-red-500/50 hover:border-red-500 transition-colors">
            <div className="text-xs text-red-400 mb-1 font-bold">❌ NO</div>
            <div className="text-xl font-bold text-red-400">{noOdds}%</div>
            <div className="text-xs text-[#E5E5E5]/50 mt-1">{parseFloat(market.noPool).toFixed(4)} BDAG</div>
          </div>
        </div>
      </div>

      {/* Closing time */}
      <div className="text-xs text-[#E5E5E5]/50 relative z-10">
        ⏰ Closes: {market.endTime}
      </div>
    </div>
  );
}

export default function Markets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [sortBy, setSortBy] = useState<"newest" | "pool" | "closing">("pool");

  useEffect(() => {
    checkOwner();
    loadMarkets();

    // Auto-refresh every 15 seconds
    const interval = setInterval(loadMarkets, 15000);
    return () => clearInterval(interval);
  }, []);

  const checkAndSwitchNetwork = async () => {
    if (!(window as any).ethereum) return;

    try {
      const accounts = await (window as any).ethereum.request({
        method: 'eth_accounts'
      });

      if (!accounts || accounts.length === 0) {
        return;
      }

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== BigInt(1043)) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BDAG_TESTNET.chainId }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [BDAG_TESTNET],
            });
          }
        }
      }
    } catch (err) {
      console.error("Network switch error:", err);
    }
  };

  const checkOwner = async () => {
    if (!(window as any).ethereum) return;

    try {
      const accounts = await (window as any).ethereum.request({
        method: 'eth_accounts'
      });

      if (accounts && accounts.length > 0) {
        setUserAddress(accounts[0].toLowerCase());
        setIsOwner(accounts[0].toLowerCase() === OWNER_ADDRESS);
      }
    } catch (err) {
      console.error("Error checking owner:", err);
    }
  };

  const loadMarkets = async () => {
    try {
      await checkAndSwitchNetwork();

      // Use server-side API to fetch markets (server uses private RPC)
      const res = await fetch('/api/markets');
      if (!res.ok) throw new Error('Failed to fetch markets');
      const fetchedFromApi = await res.json();
      const apiList: any[] = fetchedFromApi.markets || [];

      // Map API results to our UI `Market` shape without mutating the source
      const mapped: Market[] = apiList.map((m, idx) => {
        const rawClose = m.closeTime ?? m.closeTimestamp ?? 0;
        let closeNum = Number(rawClose || 0);
        if (isNaN(closeNum)) closeNum = 0;
        // detect seconds vs milliseconds: if < 1e12 treat as seconds
        if (closeNum > 0 && closeNum < 1e12) closeNum = closeNum * 1000;
        const closeTimestamp = Math.floor(closeNum);

        const yesPoolRaw = m.yesPool ?? m.yPool ?? '0';
        const noPoolRaw = m.noPool ?? m.nPool ?? '0';

        return {
          id: Number(m.id ?? idx),
          question: String(m.question ?? ""),
          endTime: new Date(closeTimestamp).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          yesPool: safeFormatEther(yesPoolRaw),
          noPool: safeFormatEther(noPoolRaw),
          creator: m.creator ?? '',
          category: m.category ?? 'Other',
          status: Number(m.status ?? 0),
          closeTimestamp
        };
      });

      setMarkets(mapped.reverse());
    } catch (err) {
      console.error("Error loading markets:", err);
      setError("Failed to load markets. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  // Filter markets by category
  const filteredMarkets = selectedCategory === "All Categories"
    ? markets
    : markets.filter(m => m.category === selectedCategory);

  // Sort markets
  const sortedMarkets = [...filteredMarkets].sort((a, b) => {
    switch (sortBy) {
      case "pool":
        const poolA = parseFloat(a.yesPool) + parseFloat(a.noPool);
        const poolB = parseFloat(b.yesPool) + parseFloat(b.noPool);
        return poolB - poolA;
      case "closing":
        return a.closeTimestamp - b.closeTimestamp;
      case "newest":
      default:
        return b.id - a.id;
    }
  });

  const displayMarkets = showAll ? sortedMarkets : sortedMarkets.slice(0, 9);

  return (
    <main className="min-h-screen px-4 pt-20 pb-20 relative z-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="hero-title mb-4">🌐 Market Predictions</h1>
          <p className="text-xl text-[#E5E5E5]/70">
            Predict the future and earn BDAG rewards
          </p>
        </div>

        {/* Filters and Controls */}
        <div className="mb-8 flex flex-wrap justify-center items-center gap-6 bg-[#1a1d2e] border border-[#00FFA3]/30 rounded-lg p-4">
          {/* Category Filter */}
          <div className="flex items-center gap-3">
            <label htmlFor="category-filter" className="text-[#00FFA3] font-bold">🏷️ Category:</label>
            <select
              id="category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[#0B0C10] border-2 border-[#00FFA3]/50 rounded-lg px-4 py-2 text-[#E5E5E5] focus:outline-none focus:border-[#00FFA3] cursor-pointer hover:bg-[#1a1d2e] transition-colors"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-3">
            <label htmlFor="sort-filter" className="text-[#0072FF] font-bold">📊 Sort:</label>
            <select
              id="sort-filter"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#0B0C10] border-2 border-[#0072FF]/50 rounded-lg px-4 py-2 text-[#E5E5E5] focus:outline-none focus:border-[#0072FF] cursor-pointer hover:bg-[#1a1d2e] transition-colors"
            >
              <option value="pool">💰 Highest Pool</option>
              <option value="newest">🆕 Newest First</option>
              <option value="closing">⏰ Closing Soon</option>
            </select>
          </div>

          {/* Market Count */}
          <div className="text-[#E5E5E5]/70 font-bold">
            {filteredMarkets.length} market{filteredMarkets.length !== 1 ? 's' : ''} found
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg border-2 border-red-500 bg-red-500/20 text-red-400 text-center animate-pulse">
            ⚠️ {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#00FFA3] mb-4"></div>
            <p className="text-lg text-[#00FFA3]">Loading markets...</p>
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-[#00FFA3] mb-4">📊 No markets in this category</p>
            <p className="text-[#E5E5E5] opacity-70 mb-8">
              {selectedCategory === "All Categories"
                ? (isOwner ? "Create your first market to get started!" : "Check back soon for exciting predictions!")
                : "Try selecting a different category or create a new market"}
            </p>
            {selectedCategory !== "All Categories" && (
              <button
                onClick={() => setSelectedCategory("All Categories")}
                className="btn-glow inline-block mb-4"
              >
                View All Categories
              </button>
            )}
            {isOwner && (
              <Link href="/create-market" className="btn-glow-green inline-block ml-4">
                ➕ Create Market
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Markets Grid (wrapped in explicit centered container to ensure centering) */}
            <div className="mb-8">
              <div className="mx-auto w-full max-w-6xl" style={{ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: '1.5rem' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
                  {displayMarkets.map((market) => (
                    <MarketCard key={market.id} market={market} />
                  ))}
                </div>
              </div>
            </div>

            {/* Show More/Less Button */}
            {filteredMarkets.length > 9 && (
              <div className="text-center">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="btn-glow px-8 py-3 hover:scale-110 transform transition-all"
                >
                  {showAll ? "Show Less ⬆️" : `Show More (${filteredMarkets.length - 9} more) ⬇️`}
                </button>
              </div>
            )}

            {/* Create Market Button - Only for Owner */}
            {isOwner && (
              <div className="text-center mt-12">
                <Link href="/create-market" className="btn-glow-green px-8 py-4 inline-block text-lg hover:scale-110 transform transition-all">
                  ➕ Create New Market
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Live Update Indicator */}
      <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-[#1a1d2e]/90 border border-[#00FFA3]/30 rounded-full px-3 py-1 text-xs z-50">
        <div className="w-2 h-2 bg-[#00FFA3] rounded-full animate-pulse" />
        <span className="text-[#00FFA3]">Auto-refresh: 15s</span>
      </div>
    </main>
  );
}