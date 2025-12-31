// frontend/src/pages/markets.tsx
import { useEffect, useState, useCallback } from "react";
import Link from 'next/link';
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { MARKET_CATEGORIES } from "../configs/marketCategories";

const NEXT_PUBLIC_READ_RPC = (process.env.NEXT_PUBLIC_READ_RPC || "").trim();

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
  rpcUrls: NEXT_PUBLIC_READ_RPC ? [NEXT_PUBLIC_READ_RPC] : [],
  blockExplorerUrls: ['https://explorer.testnet.blockdag.network']
};

const CATEGORIES = MARKET_CATEGORIES;

function categoryKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, ' ');
}

// Helper: safely convert returned pool values to ether-decimal strings
function safeFormatEther(value: unknown): string {
  if (value === null || value === undefined) return '0';
  const s = String(value);

  // If looks like integer wei (digits only and reasonably long), try formatEther
  if (/^\d+$/.test(s) && s.length >= 13) {
    try {
      return ethers.formatEther(s);
    } catch {
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
  paused?: boolean;
  disputeUsed?: boolean;
  disputeActive?: boolean;
}

function MarketCard({ market }: { market: Market }) {
  const totalPool = parseFloat(market.yesPool) + parseFloat(market.noPool);
  const yesOdds = totalPool > 0 ? ((parseFloat(market.yesPool) / totalPool) * 100).toFixed(1) : "50";
  const noOdds = totalPool > 0 ? ((parseFloat(market.noPool) / totalPool) * 100).toFixed(1) : "50";

  const isExpired = market.closeTimestamp < Date.now();
  const isResolved = market.status === 1;
  const isCancelled = market.status === 2;
  const isDisputed = Boolean(market.disputeActive);
  const isPaused = Boolean(market.paused);

  return (
    <Link
      href={`/market/${market.id}`}
      aria-label={`Open market ${market.id}: ${market.question}`}
      className={`market-card w-full p-6 border-2 rounded-lg cursor-pointer transition-all hover:shadow-[0_0_25px_rgba(0,255,163,0.4)] relative overflow-hidden group ${isExpired || isResolved || isCancelled
        ? 'opacity-60'
        : 'border-[#00FFA3]/30 hover:border-[#00FFA3] hover:scale-105'
        }`}
    >
      {/* Animated glow effect on hover */}
      {!isExpired && !isResolved && !isCancelled && (
        <div className="absolute inset-0 bg-linear-to-r from-[#00FFA3]/0 via-[#00FFA3]/10 to-[#00FFA3]/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}

      {/* Status badges */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 items-end z-10">
        {market.category && market.category !== "Other" && (
          <span className="text-xs bg-[#0072FF]/20 text-[#0072FF] px-2 py-1 rounded-full font-bold border border-[#0072FF]/30">
            {market.category}
          </span>
        )}
        {isDisputed && (
          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full font-bold">
            ⚖️ Disputed (Frozen)
          </span>
        )}
        {!isDisputed && isPaused && !isResolved && !isCancelled && (
          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full font-bold">
            ⏸️ Paused
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

      <h3 className="text-lg font-bold mb-4 line-clamp-3 pr-14 relative z-10" style={{ color: 'var(--mp-fg)' }}>
        {market.question}
      </h3>

      {/* Pool and odds display */}
      <div className="mb-4 relative z-10">
        <div className="text-sm mp-text-muted mb-3 font-bold">
          💰 Total Pool: {totalPool.toFixed(4)} BDAG
        </div>
        <div className="flex gap-2">
          <div className="flex-1 p-3 rounded-lg border-2 border-green-500/50 hover:border-green-500 transition-colors" style={{ background: 'var(--mp-bg)' }}>
            <div className="text-xs text-green-400 mb-1 font-bold">✅ YES</div>
            <div className="text-xl font-bold text-green-400">{yesOdds}%</div>
            <div className="text-xs mp-text-muted mt-1">{parseFloat(market.yesPool).toFixed(4)} BDAG</div>
          </div>
          <div className="flex-1 p-3 rounded-lg border-2 border-red-500/50 hover:border-red-500 transition-colors" style={{ background: 'var(--mp-bg)' }}>
            <div className="text-xs text-red-400 mb-1 font-bold">❌ NO</div>
            <div className="text-xl font-bold text-red-400">{noOdds}%</div>
            <div className="text-xs mp-text-muted mt-1">{parseFloat(market.noPool).toFixed(4)} BDAG</div>
          </div>
        </div>
      </div>

      {/* Closing time */}
      <div className="text-xs mp-text-muted relative z-10">
        ⏰ Closes: {market.endTime}
      </div>
    </Link>
  );
}

export default function Markets() {
  const { ethereum, account, chainId } = useWallet();

  const extractErrorInfo = (err: unknown) => {
    const result: { message: string; code?: string | number } = { message: String(err ?? 'Unknown error') };
    if (err instanceof Error) {
      result.message = err.message || String(err);
      return result;
    }
    if (typeof err === 'object' && err !== null) {
      try {
        const asRec = err as Record<string, unknown>;
        if (typeof asRec.message === 'string') result.message = asRec.message;
        if (asRec.code !== undefined) result.code = asRec.code as string | number;
      } catch {
        // ignore
      }
    }
    return result;
  };
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  // "All" is the canonical all-categories value (previously was "All Categories").
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<"newest" | "pool" | "closing">("pool");

  const isOwner = Boolean(account) && account.toLowerCase() === OWNER_ADDRESS;



  const checkAndSwitchNetwork = useCallback(async () => {
    try {
      if (!ethereum) return;
      if (!account) return;

      const current = (chainId || '').toLowerCase();
      if (current === BDAG_TESTNET.chainId.toLowerCase()) return;

      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BDAG_TESTNET.chainId }],
        });
      } catch (switchError: unknown) {
        const info = extractErrorInfo(switchError);
        if (info.code === 4902 || (info.message && info.message.includes('4902'))) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [BDAG_TESTNET],
          });
        }
      }
    } catch (err: unknown) {
      const info = extractErrorInfo(err);
      console.error("Network switch error:", info.message);
    }
  }, [account, chainId, ethereum]);

  const loadMarkets = useCallback(async (): Promise<boolean> => {
    try {
      await checkAndSwitchNetwork();

      // Use server-side API to fetch markets (server uses private RPC)
      const res = await fetch('/api/markets');
      const fetchedFromApi = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = String((fetchedFromApi && (fetchedFromApi as Record<string, unknown>).error) || 'Failed to fetch markets');
        throw new Error(errMsg);
      }
      const apiList: unknown[] = (fetchedFromApi && (fetchedFromApi as Record<string, unknown>).markets) || [];

      // Map API results to our UI `Market` shape without mutating the source
      const mapped: Market[] = apiList.map((mRaw, idx) => {
        const m = (mRaw || {}) as Record<string, unknown>;
        const rawClose = (m.closeTime ?? m.closeTimestamp ?? 0) as unknown;
        let closeNum = Number(rawClose || 0);
        if (isNaN(closeNum)) closeNum = 0;
        // detect seconds vs milliseconds: if < 1e12 treat as seconds
        if (closeNum > 0 && closeNum < 1e12) closeNum = closeNum * 1000;
        const closeTimestamp = Math.floor(closeNum);

        const yesPoolRaw = (m.yesPool ?? m['yPool'] ?? '0') as unknown;
        const noPoolRaw = (m.noPool ?? m['nPool'] ?? '0') as unknown;

        return {
          id: Number((m.id ?? idx) as unknown),
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
          creator: String(m.creator ?? ''),
          category: String(m.category ?? 'Other'),
          status: Number((m.status ?? 0) as unknown),
          closeTimestamp,
          paused: Boolean(m.paused),
          disputeUsed: Boolean(m.disputeUsed),
          disputeActive: Boolean(m.disputeActive)
        };
      });

      setMarkets(mapped.reverse());
      setError("");
      return true;
    } catch (err) {
      console.error("Error loading markets:", err);
      const msg = extractErrorInfo(err).message || "Failed to load markets";
      if (/rpc|timeout|provider|marketcount|getmarket/i.test(msg)) {
        setError("Testnet RPC looks down right now. Showing last loaded markets (auto-refresh will keep retrying). ");
      } else {
        setError("Failed to load markets. Please try again.");
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [checkAndSwitchNetwork]);

  // Initial load + periodic refresh (pauses when hidden; wallet state comes from WalletContext)
  useEffect(() => {
    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let nextDelayMs = 15_000;

    const clearTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const schedule = (ms: number) => {
      clearTimer();
      timeoutId = setTimeout(() => {
        void tick();
      }, ms);
    };

    const tick = async () => {
      if (disposed) return;

      // Avoid background polling (mobile battery + RPC spam)
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        schedule(30_000);
        return;
      }

      const ok = await loadMarkets();
      if (ok) {
        nextDelayMs = 15_000;
      } else {
        nextDelayMs = Math.min(nextDelayMs * 2, 60_000);
      }

      schedule(nextDelayMs);
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        nextDelayMs = 15_000;
        // When the user comes back from a wallet popup/app switch, refresh immediately.
        schedule(0);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    // Initial load
    schedule(0);

    return () => {
      disposed = true;
      clearTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [loadMarkets]);

  // Filter markets by category
  const selectedKey = categoryKey(selectedCategory);
  const isAllSelected = selectedKey === 'all' || selectedKey === 'all categories' || selectedKey === '';
  const filteredMarkets = isAllSelected
    ? markets
    : markets.filter(m => categoryKey(m.category) === selectedKey);

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
    <main className="min-h-screen px-4 pt-1 pb-20 relative z-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h1 className="sr-only">Market Predictions</h1>

        {/* Filters and Controls */}
        <div className="mb-8 py-2">
          {/* Categories (horizontal, Polymarket/Kalshi-style) */}
          <div className="w-full overflow-x-auto">
            <div className="flex flex-nowrap items-center gap-3 justify-start whitespace-nowrap py-1">
              {CATEGORIES.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    aria-pressed={active}
                    className={
                      "mp-chip mp-chip--lg rounded-full font-bold transition-colors " +
                      (active ? "mp-chip--active-green" : "")
                    }
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Spacer (requested vertical gap before filters) */}
          <div className="h-4" />

          {/* Sort controls (no 'Sort:' label) */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              {(
                [
                  { key: "pool", label: "Highest Pool" },
                  { key: "newest", label: "Newest" },
                  { key: "closing", label: "Closing" },
                ] as const
              ).map(({ key, label }) => {
                const active = sortBy === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSortBy(key)}
                    aria-pressed={active}
                    className={
                      "mp-chip rounded-full font-bold transition-colors " +
                      (active ? "mp-chip--active-blue" : "")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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
            <p className="text-xl text-[#00FFA3] mb-4"> No markets in this category</p>
            <p className="mp-text-muted mb-8">
              {isAllSelected
                ? (isOwner ? "Create your first market to get started!" : "Check back soon for exciting predictions!")
                : "Try selecting a different category or create a new market"}
            </p>
            {!isAllSelected && (
              <button
                onClick={() => setSelectedCategory("All")}
                className="btn-glow inline-block mb-4"
              >
                View All
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-stretch">
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
    </main>
  );
}