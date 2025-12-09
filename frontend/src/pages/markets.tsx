// frontend/src/pages/markets.tsx
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

// Owner address - only this address can pause/edit/delete markets
const OWNER_ADDRESS = "0x539bAA99044b014e453CDa36C4AD3dE5E4575367".toLowerCase();

// BDAG Testnet configuration
const BDAG_TESTNET = {
  chainId: '0x413', // 1043 in hex
  chainName: 'BDAG Testnet',
  nativeCurrency: {
    name: 'BDAG',
    symbol: 'BDAG',
    decimals: 18
  },
  rpcUrls: ['https://bdag-testnet.nownodes.io/a9d7af97-bb9a-4e41-8ff7-93444c49f776'],
  blockExplorerUrls: ['https://explorer.testnet.blockdag.network']
};

interface Market {
  id: number;
  question: string;
  closeTime: string;
  paused: boolean;
}

export default function Markets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    checkAndSwitchNetwork();
    loadMarkets();
    checkOwnership();
  }, []);

  const checkAndSwitchNetwork = async () => {
    if (!(window as any).ethereum) return;

    try {
      // First check if user has connected accounts
      const accounts = await (window as any).ethereum.request({ 
        method: 'eth_accounts' 
      });
      
      // If no accounts connected, don't check network (avoids errors for non-connected users)
      if (!accounts || accounts.length === 0) {
        return;
      }

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const network = await provider.getNetwork();
      
      // Check if we're on BDAG testnet (chainId 1043)
      if (network.chainId !== BigInt(1043)) {
        try {
          // Try to switch to BDAG testnet
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BDAG_TESTNET.chainId }],
          });
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to wallet
          if (switchError.code === 4902) {
            try {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [BDAG_TESTNET],
              });
            } catch (addError) {
              console.error('Error adding BDAG testnet:', addError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking network:', error);
    }
  };

  const checkOwnership = async () => {
    if (!(window as any).ethereum) return;
    
    try {
      // First check if user has connected accounts
      const accounts = await (window as any).ethereum.request({ 
        method: 'eth_accounts' 
      });
      
      // If no accounts connected, don't check ownership (avoids prompting wallet)
      if (!accounts || accounts.length === 0) {
        return;
      }

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setUserAddress(address.toLowerCase());
      setIsOwner(address.toLowerCase() === OWNER_ADDRESS);
    } catch (err: any) {
      // Silently handle user rejection - this is expected behavior
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        console.log("User declined wallet connection");
        return;
      }
      console.error("Error checking ownership:", err);
    }
  };

  const toggleMarketPause = async (marketId: number) => {
    const market = markets.find(m => m.id === marketId);
    if (!market) return;
    
    const newPausedState = !market.paused;
    
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      const tx = newPausedState 
        ? await contract.pauseMarket(marketId)
        : await contract.unpauseMarket(marketId);
      await tx.wait();
      
      // Reload markets to get updated state
      await loadMarkets();
    } catch (err: any) {
      console.error("Error toggling pause:", err);
      alert("Failed to " + (newPausedState ? "pause" : "unpause") + " market");
    }
  };

  const loadMarkets = async () => {
    try {
      if (!(window as any).ethereum) {
        console.log("No wallet provider found");
        setLoading(false);
        return;
      }

      // Check if user has connected accounts
      const accounts = await (window as any).ethereum.request({ 
        method: 'eth_accounts' 
      });
      
      // If no accounts connected, don't try to load (user can browse without wallet)
      if (!accounts || accounts.length === 0) {
        console.log("No wallet connected - markets will load after connection");
        setLoading(false);
        return;
      }

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      
      // Check network
      const network = await provider.getNetwork();
      console.log("Connected to network:", network.chainId, network.name);
      
      // Only show error if user is connected but on wrong network
      if (network.chainId !== BigInt(1043)) {
        console.log("Not on BDAG testnet - please switch networks to view markets");
        setLoading(false);
        return;
      }
      
      // Check if contract exists
      const code = await provider.getCode(CONTRACT_ADDRESS);
      if (code === "0x") {
        console.error("No contract deployed at", CONTRACT_ADDRESS);
        alert(`No contract found at ${CONTRACT_ADDRESS}. Please check the contract address.`);
        setLoading(false);
        return;
      }
      
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const count = await contract.nextMarketId();
      console.log("Total markets:", count.toString());
      
      if (Number(count) === 0) {
        console.log("No markets created yet");
        setMarkets([]);
        setLoading(false);
        return;
      }
      
      const fetched: Market[] = [];

      for (let i = 0; i < count; i++) {
        try {
          const m = await contract.markets(i);
          fetched.push({
            id: i,
            question: m.question,
            closeTime: new Date(Number(m.closeTime) * 1000).toLocaleString(),
            paused: m.paused,
          });
        } catch (err) {
          console.warn(`Market ${i} not accessible:`, err);
        }
      }

      setMarkets(fetched.reverse());
    } catch (err) {
      console.error("Error loading markets:", err);
      alert("Failed to load markets. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const featured = (category: string) =>
    markets.find((m) => m.question.toLowerCase().includes(category.toLowerCase()));

  const featuredCrypto = featured("crypto");
  const featuredEntertainment = featured("entertainment");
  const featuredWeather = featured("weather");

  const otherMarkets = markets.filter(
    (m) =>
      !m.question.toLowerCase().includes("crypto") &&
      !m.question.toLowerCase().includes("entertainment") &&
      !m.question.toLowerCase().includes("weather")
  );

  return (
    <main className="markets-container relative z-10">
      <h1 className="markets-title">🌐 Market Predictions</h1>

      {loading ? (
        <p className="markets-loading">Loading markets...</p>
      ) : markets.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-xl text-[#00FFA3] mb-4">No markets available yet</p>
          <p className="text-[#E5E5E5] opacity-70">Check back soon or create your first market!</p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="markets-subtitle">Featured Markets</h2>
            <div className="markets-featured-grid">
              {featuredCrypto && (
                <MarketCard title="Crypto" market={featuredCrypto} color="#0ff" isOwner={isOwner} onTogglePause={toggleMarketPause} />
              )}
              {featuredEntertainment && (
                <MarketCard title="Entertainment" market={featuredEntertainment} color="#f0f" isOwner={isOwner} onTogglePause={toggleMarketPause} />
              )}
              {featuredWeather && (
                <MarketCard title="Weather" market={featuredWeather} color="#0f0" isOwner={isOwner} onTogglePause={toggleMarketPause} />
              )}
            </div>
          </section>

          <section>
            <h2 className="markets-subtitle">All Markets</h2>
            <div className="markets-grid">
              {(showAll ? otherMarkets : otherMarkets.slice(0, 6)).map((m) => (
                <MarketCard key={m.id} market={m} isOwner={isOwner} onTogglePause={toggleMarketPause} />
              ))}
            </div>

            {otherMarkets.length > 6 && (
              <button
                className="market-more-btn"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show Less" : "Show More"}
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}

interface MarketCardProps {
  title?: string;
  market: Market;
  color?: string;
  isOwner?: boolean;
  onTogglePause?: (marketId: number) => void;
}

function MarketCard({ title, market, color, isOwner, onTogglePause }: MarketCardProps) {
  const handlePauseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onTogglePause) {
      onTogglePause(market.id);
    }
  };

  return (
    <div className="relative group">
      {/* Owner Quick Pause Button */}
      {isOwner && onTogglePause && (
        <button
          onClick={handlePauseClick}
          className="absolute top-2 right-2 z-10 px-3 py-1 rounded-lg font-bold text-xs transition-all opacity-0 group-hover:opacity-100"
          style={{
            backgroundColor: market.paused ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)',
            border: `2px solid ${market.paused ? '#22c55e' : '#f97316'}`,
            color: market.paused ? '#22c55e' : '#f97316',
          }}
        >
          {market.paused ? '▶️' : '⏸️'}
        </button>
      )}
      
      <a 
        href={`/market/${market.id}`}
        className="market-card hover:scale-105 transition-transform cursor-pointer block" 
        style={{
          ...color ? { borderColor: color } : {},
          ...(market.paused ? { 
            opacity: 0.6,
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,0.05)'
          } : {})
        }}
      >
        {market.paused && (
          <div style={{
            position: 'absolute',
            top: '0.5rem',
            left: '0.5rem',
            backgroundColor: 'rgba(249,115,22,0.2)',
            border: '2px solid #f97316',
            color: '#f97316',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
          }}>
            ⏸️ PAUSED
          </div>
        )}
        {title && <div className="market-category">{title}</div>}
        <p className="market-question" style={{ marginTop: market.paused ? '2rem' : undefined }}>{market.question}</p>
        <p className="market-time">Closes: {market.closeTime}</p>
      </a>
    </div>
  );
}
