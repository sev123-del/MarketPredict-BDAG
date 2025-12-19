"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from 'next/link';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../configs/contractConfig";

// Owner address - only this address can create/edit/delete markets
const OWNER_ADDRESS = "0x539bAA99044b014e453CDa36C4AD3dE5E4575367".toLowerCase();

interface MarketData {
  question: string;
  yesPool: bigint;
  noPool: bigint;
  resolved: boolean;
  outcomeYes: boolean;
  closeTime: bigint;
}

// Parimutuel Calculation - Core System
const calculateParimutuel = (
  winningPoolSize: bigint,
  losingPoolSize: bigint,
  userBetAmount: bigint
) => {
  const totalPool = winningPoolSize + losingPoolSize;

  // Edge case: no losing pool (refund scenario)
  if (losingPoolSize === BigInt(0)) {
    return {
      grossPayout: userBetAmount,
      profit: BigInt(0),
      fee: BigInt(0),
      net: userBetAmount,
      oddsFactor: 1.0
    };
  }

  // Edge case: empty winning pool (you're first bettor on this side)
  // You'd win entire losing pool + your bet back
  if (winningPoolSize === BigInt(0)) {
    const grossPayout = userBetAmount + losingPoolSize;
    const profit = losingPoolSize;
    const fee = (profit * BigInt(290)) / BigInt(10000); // 2.9% fee on profit
    const net = grossPayout - fee;
    const oddsFactor = Number(grossPayout) / Number(userBetAmount);
    return {
      grossPayout,
      profit,
      fee,
      net,
      oddsFactor
    };
  }

  // Standard parimutuel: (your bet * total pool) / winning pool
  const grossPayout = (userBetAmount * totalPool) / winningPoolSize;
  const profit = grossPayout > userBetAmount ? grossPayout - userBetAmount : BigInt(0);
  const fee = (profit * BigInt(290)) / BigInt(10000); // 2.9% fee on profit
  const net = grossPayout - fee;

  // Odds: totalPool / winningPool (how much you get back per unit bet)
  const oddsFactor = Number(totalPool) / Number(winningPoolSize);

  return {
    grossPayout,
    profit,
    fee,
    net,
    oddsFactor
  };
};

export default function MarketDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState<"yes" | "no" | null>(null);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [successMessage, setSuccessMessage] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [flashWarning, setFlashWarning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [potentialWinnings, setPotentialWinnings] = useState("0");
  const [userAddress, setUserAddress] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [oppositePoolEmpty, setOppositePoolEmpty] = useState(false);

  const formatDateTime = (timestamp: bigint | number | undefined) => {

    // Safety check - if timestamp is undefined, null, or 0
    if (timestamp === undefined || timestamp === null || timestamp === BigInt(0) || timestamp === 0) {
      return "Closing time pending";
    }

    // Ensure timestamp is a number and convert from seconds to milliseconds
    let timestampMs: number;

    if (typeof timestamp === 'bigint') {
      timestampMs = Number(timestamp) * 1000;
    } else if (typeof timestamp === 'string') {
      timestampMs = parseInt(timestamp) * 1000;
    } else {
      timestampMs = timestamp * 1000;
    }

    const date = new Date(timestampMs);


    // Check if date is valid
    if (isNaN(date.getTime()) || date.getTime() <= 0) {
      return "Invalid closing time";
    }

    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    };

    return date.toLocaleString('en-US', options);
  };

  useEffect(() => {
    if (id) loadMarket();
    checkOwnership();
  }, [id]);

  // Real-time pool updates every 2 seconds
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      loadMarket();
    }, 2000);
    return () => clearInterval(interval);
  }, [id]);

  const checkOwnership = async () => {
    if (!(window as any).ethereum) {
      setUserAddress("");
      setIsOwner(false);
      return;
    }

    try {
      // Non-intrusive check for connected accounts (does not prompt the wallet)
      const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        const address = String(accounts[0]).toLowerCase();
        setUserAddress(address);
        setIsOwner(address === OWNER_ADDRESS);
      } else {
        setUserAddress("");
        setIsOwner(false);
      }
    } catch (err) {
      console.error("Error checking ownership:", err);
      setUserAddress("");
      setIsOwner(false);
    }
  };

  const loadMarket = async () => {
    try {
      // Use server-side API to fetch market data (server will use private RPC)
      const marketId = typeof id === 'string' ? Number(id) : Number(id?.toString() || 0);
      const res = await fetch(`/api/market/${marketId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch market');
      }
      const m = await res.json();
      setMarket({
        question: m.question,
        yesPool: BigInt(m.yesPool || 0),
        noPool: BigInt(m.noPool || 0),
        resolved: m.status === 1,
        outcomeYes: Boolean(m.outcome),
        closeTime: BigInt(m.closeTime || 0),
      });
    } catch (err) {
      console.error("Error loading market:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePredict = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setErrorMessage("Please enter a crypto value greater than 0, then try again.");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    if (!(window as any).ethereum) {
      setErrorMessage("Please connect your wallet!");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    try {
      setPredicting(true);

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const amountWei = ethers.parseEther(amount);
      const tx = await contract.predict(id, side === "yes" ? 1 : 0, amountWei);
      await tx.wait();

      setSuccessMessage(`Prediction placed: ${side?.toUpperCase() || 'UNKNOWN'} for ${amount} BDAG`);
      setTimeout(() => setSuccessMessage(""), 5000);
      setAmount("");
      await loadMarket();
    } catch (err: any) {
      console.error("Error placing prediction:", err);

      // Check for user rejection (ethers v6 format)
      const errorCode = err?.code;
      const errorReason = err?.reason;
      const errorMessage = String(err?.message || "");

      let userMessage = "Failed to place prediction";

      // Check for transaction rejection
      if (errorCode === "ACTION_REJECTED" || errorCode === 4001) {
        userMessage = "💭 Transaction cancelled by user";
      } else if (errorReason === "rejected" || String(errorReason).includes("rejected")) {
        userMessage = "💭 Transaction cancelled by user";
      } else if (errorMessage.includes("user denied") || errorMessage.includes("user rejected")) {
        userMessage = "💭 Transaction cancelled by user";
      } else {
        // Check for other errors
        const errorString = JSON.stringify(err).toLowerCase();
        if (errorString.includes("insufficient") ||
          (err.reason && err.reason.toLowerCase().includes("insufficient")) ||
          (err.message && err.message.toLowerCase().includes("insufficient"))) {
          userMessage = "❌ Insufficient balance! Please deposit more crypto to your MarketPredict account.";
        } else if (err.reason) {
          userMessage = err.reason.split("\n")[0]; // Take first line only
        } else if (err.message) {
          userMessage = err.message.split("\n")[0]; // Take first line only
        }
      }

      setErrorMessage(userMessage);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setPredicting(false);
    }
  };

  const handleClaim = async () => {
    if (!market || !id) return;

    try {
      setClaiming(true);

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.claim(id);
      await tx.wait();

      setSuccessMessage("✅ Winnings claimed successfully!");
      setTimeout(() => setSuccessMessage(""), 5000);
      await loadMarket();
    } catch (err: any) {
      console.error("Error claiming winnings:", err);

      let userMessage = "Failed to claim winnings";
      const errorString = JSON.stringify(err).toLowerCase();
      if (errorString.includes("already claimed")) {
        userMessage = "You've already claimed your winnings from this market";
      } else if (errorString.includes("not resolved")) {
        userMessage = "Market must be resolved before claiming";
      } else if (err.message && err.message.includes("user rejected")) {
        userMessage = "Transaction cancelled by user";
      } else if (err.reason) {
        userMessage = err.reason;
      } else if (err.message) {
        userMessage = err.message;
      }

      setErrorMessage(userMessage);
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setClaiming(false);
    }
  };

  const totalPool = market ? market.yesPool + market.noPool : BigInt(0);
  const yesPercentage = totalPool > BigInt(0) ? Number((market!.yesPool * BigInt(100)) / totalPool) : 50;
  const noPercentage = totalPool > BigInt(0) ? Number((market!.noPool * BigInt(100)) / totalPool) : 50;

  // Calculate odds using parimutuel system (includes hypothetical 1 BDAG bet)
  let yesOdds = "∞";
  let noOdds = "∞";

  if (market && totalPool > BigInt(0)) {
    if (market.yesPool > BigInt(0)) {
      // Add hypothetical 1 BDAG bet to winning pool for accurate live odds
      const hypotheticalYesPool = market.yesPool + ethers.parseEther("1");
      const yesCalc = calculateParimutuel(hypotheticalYesPool, market.noPool, ethers.parseEther("1"));
      yesOdds = yesCalc.oddsFactor.toFixed(2);
    }
    if (market.noPool > BigInt(0)) {
      // Add hypothetical 1 BDAG bet to winning pool for accurate live odds
      const hypotheticalNoPool = market.noPool + ethers.parseEther("1");
      const noCalc = calculateParimutuel(hypotheticalNoPool, market.yesPool, ethers.parseEther("1"));
      noOdds = noCalc.oddsFactor.toFixed(2);
    }
  }

  // Calculate potential winnings with empty pool detection
  useEffect(() => {
    if (market && amount && side && Number(amount) > 0) {
      const amountBigInt = ethers.parseEther(amount);
      const currentWinningPool = side === "yes" ? market.yesPool : market.noPool;
      const losingPool = side === "yes" ? market.noPool : market.yesPool;

      // Add user's bet to winning pool (this is what actually happens on-chain)
      const winningPoolAfterBet = currentWinningPool + amountBigInt;

      if (losingPool === BigInt(0)) {
        setOppositePoolEmpty(true);
        setPotentialWinnings(amount); // Full refund
      } else {
        setOppositePoolEmpty(false);
        const payout = calculateParimutuel(winningPoolAfterBet, losingPool, amountBigInt);
        setPotentialWinnings(ethers.formatEther(payout.net));
      }
    } else {
      setPotentialWinnings("0");
      setOppositePoolEmpty(false);
    }
  }, [amount, side, market]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-[#00C4BA]">Loading market...</p>
      </main>
    );
  }

  if (!market) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-red-400 mb-4">Market not found</p>
          <Link href="/markets" className="text-[#00C4BA] hover:text-[#00968E]">← Back to Markets</Link>
        </div>
      </main>
    );
  }

  const isExpired = Number(market.closeTime) * 1000 < Date.now();

  return (
    <main className="min-h-screen px-4 pt-20 pb-20 relative z-10">
      {/* Fixed Position Success Notification */}
      {successMessage && (
        <div style={{
          position: 'fixed',
          top: '5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          width: '90%',
          maxWidth: '48rem'
        }}>
          <div className="p-4 bg-green-500/20 border-2 border-green-500 rounded-lg text-center font-bold slide-in shadow-[0_0_30px_rgba(34,197,94,0.5)]" style={{
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(34,197,94,0.25)'
          }}>
            <p className="text-green-400 flex items-center justify-center gap-2">
              <span className="text-2xl">✅</span>
              {successMessage}
            </p>
          </div>
        </div>
      )}

      {/* Fixed Position Error Notification */}
      {errorMessage && (
        <div style={{
          position: 'fixed',
          top: '5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          width: '90%',
          maxWidth: '48rem'
        }}>
          <div className="p-4 bg-orange-500/20 border-2 border-orange-500 rounded-lg text-center font-bold slide-in shadow-[0_0_30px_rgba(249,115,22,0.5)]" style={{
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(249,115,22,0.25)'
          }}>
            <p className="text-orange-400 flex items-center justify-center gap-2" style={{ fontSize: '1rem' }}>
              <span style={{ fontSize: '4rem', lineHeight: '1' }}>⚠️</span>
              <span>{errorMessage}</span>
            </p>
          </div>
        </div>
      )}

      <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <Link href="/markets" className="text-[#00C4BA] hover:text-[#00968E] transition-colors">
            ← Back to Markets
          </Link>

          {/* Owner-only controls */}
          {isOwner && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  alert('Edit functionality coming soon!');
                }}
                className="px-4 py-2 bg-[#0072FF]/20 border-2 border-[#0072FF] text-[#0072FF] rounded-lg font-semibold hover:bg-[#0072FF]/30 transition-all text-sm"
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this market? This action cannot be undone.')) {
                    alert('Delete functionality coming soon!');
                  }
                }}
                className="px-4 py-2 bg-red-500/20 border-2 border-red-500 text-red-400 rounded-lg font-semibold hover:bg-red-500/30 transition-all text-sm"
              >
                🗑️ Delete
              </button>
            </div>
          )}
        </div>

        <div className="bg-[#1a1d2e] p-8 rounded-lg border border-[#00C4BA]/30 shadow-[0_0_30px_rgba(0,196,186,0.3)] mb-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-[#E5E5E5] mb-4">{market.question}</h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  ...(market.resolved
                    ? {
                      backgroundColor: 'rgba(168, 85, 247, 0.2)',
                      color: '#c084fc',
                      border: '2px solid rgba(168, 85, 247, 0.5)'
                    }
                    : isExpired
                      ? {
                        backgroundColor: 'rgba(249, 115, 22, 0.2)',
                        color: '#fb923c',
                        border: '2px solid rgba(249, 115, 22, 0.5)'
                      }
                      : {
                        backgroundColor: 'rgba(0, 255, 163, 0.2)',
                        color: '#00FFA3',
                        border: '2px solid #00FFA3',
                        boxShadow: '0 0 25px rgba(0, 255, 163, 0.8)',
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                      })
                }}>
                  {market.resolved ? "✓ Resolved" : isExpired ? "⏰ Expired" : (
                    <>
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: '#00FFA3' }}></span>
                        <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: '#00FFA3' }}></span>
                      </span>
                      <span style={{ letterSpacing: '0.1em' }}>● MARKET LIVE ●</span>
                    </>
                  )}
                </span>

                <select
                  id="timezone-select"
                  name="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="px-3 py-2 bg-[#0B0C10] border border-[#00C4BA]/50 rounded-lg text-[#E5E5E5] text-xs focus:outline-none focus:border-[#00C4BA] focus:shadow-[0_0_10px_rgba(0,196,186,0.5)] transition-all"
                >
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Europe/Paris">Paris (CET)</option>
                  <option value="Asia/Tokyo">Tokyo (JST)</option>
                  <option value="Asia/Dubai">Dubai (GST)</option>
                  <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                  <option value="Australia/Sydney">Sydney (AEDT)</option>
                  <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>Your Local Time</option>
                </select>
              </div>

              <div className="text-[#FF3333] font-semibold" style={{ fontSize: '0.875rem' }}>
                ⏰ Closes: <strong>{formatDateTime(Number(market.closeTime))}</strong>
              </div>
            </div>
          </div>

          {market.resolved && (
            <div className="mb-6 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <p className="text-purple-400 font-semibold">
                Final Outcome: {market.outcomeYes ? "YES ✓" : "NO ✗"}
              </p>
            </div>
          )}

          {/* Pool Display */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-[#00C4BA] mb-2">Current Pools</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#0B0C10] p-4 rounded-lg border border-green-500/50">
                <p className="text-sm text-[#E5E5E5]/70 mb-1">YES Pool</p>
                <p className="text-2xl font-bold text-green-400">
                  {ethers.formatEther(market.yesPool)} BDAG
                </p>
                <p className="text-sm text-[#E5E5E5]/50 mt-1">{yesPercentage.toFixed(1)}%</p>
              </div>
              <div className="bg-[#0B0C10] p-4 rounded-lg border border-red-500/50">
                <p className="text-sm text-[#E5E5E5]/70 mb-1">NO Pool</p>
                <p className="text-2xl font-bold text-red-400">
                  {ethers.formatEther(market.noPool)} BDAG
                </p>
                <p className="text-sm text-[#E5E5E5]/50 mt-1">{noPercentage.toFixed(1)}%</p>
              </div>
            </div>

            {/* Visual Progress Bar with Live Odds */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2 font-bold" style={{ fontSize: '1.125rem', lineHeight: 1.2 }}>
                <span style={{ color: '#00FFA3' }}>YES Odds: {yesOdds}x</span>
                <span style={{ color: '#ef4444' }}>NO Odds: {noOdds}x</span>
              </div>
              <div className="h-6 bg-[#0B0C10] rounded-full overflow-hidden flex relative" style={{
                boxShadow: '0 0 20px rgba(0,196,186,0.3) inset'
              }}>
                <div
                  className="transition-all duration-500 flex items-center justify-center text-xs font-bold"
                  style={{
                    width: `${yesPercentage}%`,
                    background: 'linear-gradient(90deg, #00FFA3 0%, #00C4BA 100%)',
                    color: '#0B0C10',
                    boxShadow: '0 0 15px rgba(0,255,163,0.6)',
                    borderTopLeftRadius: '9999px',
                    borderBottomLeftRadius: '9999px',
                    borderTopRightRadius: yesPercentage === 100 ? '9999px' : '0',
                    borderBottomRightRadius: yesPercentage === 100 ? '9999px' : '0'
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
                    boxShadow: '0 0 15px rgba(239,68,68,0.6)',
                    borderTopRightRadius: '9999px',
                    borderBottomRightRadius: '9999px',
                    borderTopLeftRadius: noPercentage === 100 ? '9999px' : '0',
                    borderBottomLeftRadius: noPercentage === 100 ? '9999px' : '0'
                  }}
                >
                  {noPercentage > 15 && `${noPercentage.toFixed(0)}%`}
                </div>
              </div>
            </div>
          </div>

          {/* Prediction Form */}
          {!market.resolved && !isExpired && (
            <div className="border-t border-[#00C4BA]/20 pt-6">
              <h2 className="text-xl font-semibold text-[#00C4BA] mb-4">Place Your Prediction:</h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <button
                  onClick={() => setSide("yes")}
                  style={{
                    padding: '2rem',
                    borderRadius: '0.75rem',
                    fontWeight: 'bold',
                    fontSize: '1.5rem',
                    transition: 'all 0.3s',
                    transform: side === "yes" ? 'scale(1.05)' : 'scale(1)',
                    backgroundColor: side === "yes" ? '#00FFA3' : '#0B0C10',
                    color: side === "yes" ? '#0B0C10' : '#E5E5E5',
                    border: (side === "yes" || side === null) ? '2px solid #00FFA3' : '2px solid transparent',
                    boxShadow: side === "yes" ? '0 0 30px rgba(0,255,163,0.7)' : (side === null ? '0 0 15px rgba(0,255,163,0.6)' : 'none'),
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    if (side !== "yes") {
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                >
                  ✓ YES
                </button>
                <button
                  onClick={() => setSide("no")}
                  style={{
                    padding: '2rem',
                    borderRadius: '0.75rem',
                    fontWeight: 'bold',
                    fontSize: '1.5rem',
                    transition: 'all 0.3s',
                    transform: side === "no" ? 'scale(1.05)' : 'scale(1)',
                    backgroundColor: side === "no" ? '#ef4444' : '#0B0C10',
                    color: side === "no" ? '#ffffff' : '#E5E5E5',
                    border: (side === "no" || side === null) ? '2px solid #ef4444' : '2px solid transparent',
                    boxShadow: side === "no" ? '0 0 30px rgba(239,68,68,0.7)' : (side === null ? '0 0 15px rgba(239,68,68,0.6)' : 'none'),
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    if (side !== "no") {
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                >
                  ✗ NO
                </button>
              </div>

              {/* Potential Winnings Display with Dynamic Messaging */}
              {amount && side && Number(amount) > 0 && (
                <div className="mb-6 p-6 rounded-lg text-center" style={{
                  background: 'linear-gradient(135deg, rgba(0,255,163,0.15) 0%, rgba(0,196,186,0.15) 100%)',
                  border: '2px solid',
                  borderColor: side === "yes" ? '#00FFA3' : '#ef4444',
                  boxShadow: `0 0 40px ${side === "yes" ? 'rgba(0,255,163,0.4)' : 'rgba(239,68,68,0.4)'}`,
                  animation: 'pulse-glow 2s ease-in-out infinite'
                }}>
                  {oppositePoolEmpty ? (
                    <>
                      <div className="text-sm text-[#E5E5E5]/70 mb-1">💰 Full refund if no one picks other side. Winnings grow as opposite pool grows.</div>
                      <div className="text-4xl font-bold mb-2" style={{
                        color: side === "yes" ? '#00FFA3' : '#ef4444',
                        textShadow: `0 0 20px ${side === "yes" ? 'rgba(0,255,163,0.8)' : 'rgba(239,68,68,0.8)'}`
                      }}>
                        {Number(potentialWinnings).toFixed(4)} BDAG
                      </div>
                      <div className="text-xs text-[#E5E5E5]/60">
                        Set the Trend - Be First to Predict!
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-[#E5E5E5]/70 mb-1">💰 You'll Take Home If You Win ({Number(potentialWinnings).toFixed(4)} estimate) BDAG as of right now. Winnings fluctuate as pools grow.</div>
                      <div className="text-4xl font-bold mb-2" style={{
                        color: side === "yes" ? '#00FFA3' : '#ef4444',
                        textShadow: `0 0 20px ${side === "yes" ? 'rgba(0,255,163,0.8)' : 'rgba(239,68,68,0.8)'}`
                      }}>
                        {Number(potentialWinnings).toFixed(4)} BDAG
                      </div>
                      <div className="text-xs text-[#E5E5E5]/60">
                        {(() => {
                          const profitPercent = ((Number(potentialWinnings) - Number(amount)) / Number(amount) * 100);
                          if (profitPercent > 0) {
                            return `🚀 ${profitPercent.toFixed(1)}% gain on your ${amount} BDAG prediction`;
                          } else if (profitPercent < 0) {
                            return `Refund scenario: getting back your bet`;
                          } else {
                            return 'Your full prediction returned';
                          }
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="my-6 border-t-2 border-[#00C4BA]/20"></div>

              <div className="mb-4" style={{ marginTop: '2rem' }}>
                {(!amount || Number(amount) <= 0 || !side) && (
                  <div className="mb-6 p-6 bg-orange-500/20 border border-orange-500 rounded-lg text-orange-300 text-center animate-pulse relative" style={{ fontSize: '1.25rem', fontWeight: 'bold', zIndex: 100 }}>
                    <span className="text-2xl" style={{ animation: flashWarning ? 'flash5times 5s ease-in-out' : 'none' }}>⚠️</span> Please pick 'Yes' or 'No' and enter your crypto amount
                  </div>
                )}
                <label htmlFor="predict-amount" className="block text-[#E5E5E5] mb-4 font-bold" style={{ fontSize: '1.5rem' }}>Amount to Predict</label>

                {/* Quick Amount Buttons - 3 Rows */}
                <div className="mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Row 1 */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {['1', '5', '10', '25', '50', '100'].map((quickAmount) => (
                      <button
                        key={quickAmount}
                        type="button"
                        onClick={() => setAmount(quickAmount)}
                        disabled={predicting}
                        style={{
                          flex: 1,
                          padding: '0.75rem 0.5rem',
                          borderRadius: '0.5rem',
                          fontWeight: 'bold',
                          fontSize: '0.875rem',
                          transition: 'all 0.2s',
                          backgroundColor: amount === quickAmount ? '#00C4BA' : '#0B0C10',
                          color: amount === quickAmount ? '#0B0C10' : '#E5E5E5',
                          border: `2px solid ${amount === quickAmount ? '#00C4BA' : 'rgba(0,196,186,0.3)'}`,
                          boxShadow: amount === quickAmount ? '0 0 20px rgba(0,196,186,0.6)' : 'none',
                          transform: amount === quickAmount ? 'scale(1.05)' : 'scale(1)',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          if (amount !== quickAmount) {
                            e.currentTarget.style.borderColor = '#00C4BA';
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (amount !== quickAmount) {
                            e.currentTarget.style.borderColor = 'rgba(0,196,186,0.3)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                      >
                        {quickAmount}
                      </button>
                    ))}
                  </div>

                  {/* Row 2 */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {['250', '500', '1000', '2500', '5000', '10000'].map((quickAmount) => (
                      <button
                        key={quickAmount}
                        type="button"
                        onClick={() => setAmount(quickAmount)}
                        disabled={predicting}
                        style={{
                          flex: 1,
                          padding: '0.75rem 0.5rem',
                          borderRadius: '0.5rem',
                          fontWeight: 'bold',
                          fontSize: '0.875rem',
                          transition: 'all 0.2s',
                          backgroundColor: amount === quickAmount ? '#00C4BA' : '#0B0C10',
                          color: amount === quickAmount ? '#0B0C10' : '#E5E5E5',
                          border: `2px solid ${amount === quickAmount ? '#00C4BA' : 'rgba(0,196,186,0.3)'}`,
                          boxShadow: amount === quickAmount ? '0 0 20px rgba(0,196,186,0.6)' : 'none',
                          transform: amount === quickAmount ? 'scale(1.05)' : 'scale(1)',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          if (amount !== quickAmount) {
                            e.currentTarget.style.borderColor = '#00C4BA';
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (amount !== quickAmount) {
                            e.currentTarget.style.borderColor = 'rgba(0,196,186,0.3)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                      >
                        {Number(quickAmount).toLocaleString()}
                      </button>
                    ))}
                  </div>

                  {/* Row 3 */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {['25000', '50000', '100000', '250000', '500000', '1000000'].map((quickAmount) => (
                      <button
                        key={quickAmount}
                        type="button"
                        onClick={() => setAmount(quickAmount)}
                        disabled={predicting}
                        style={{
                          flex: 1,
                          padding: '0.75rem 0.5rem',
                          borderRadius: '0.5rem',
                          fontWeight: 'bold',
                          fontSize: '0.875rem',
                          transition: 'all 0.2s',
                          backgroundColor: amount === quickAmount ? '#00C4BA' : '#0B0C10',
                          color: amount === quickAmount ? '#0B0C10' : '#E5E5E5',
                          border: `2px solid ${amount === quickAmount ? '#00C4BA' : 'rgba(0,196,186,0.3)'}`,
                          boxShadow: amount === quickAmount ? '0 0 20px rgba(0,196,186,0.6)' : 'none',
                          transform: amount === quickAmount ? 'scale(1.05)' : 'scale(1)',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          if (amount !== quickAmount) {
                            e.currentTarget.style.borderColor = '#00C4BA';
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (amount !== quickAmount) {
                            e.currentTarget.style.borderColor = 'rgba(0,196,186,0.3)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                      >
                        {Number(quickAmount).toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ position: 'relative', width: '100%', maxWidth: '100%' }}>
                  <input
                    id="predict-amount"
                    name="predictAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00 BDAG"
                    style={{
                      width: 'calc(100% - 3.5rem)',
                      padding: '2.25rem 1rem',
                      fontSize: '1.5rem',
                      backgroundColor: '#0B0C10',
                      border: '2px solid rgba(0,196,186,0.5)',
                      borderRadius: '0.5rem',
                      color: '#E5E5E5',
                      outline: 'none',
                      transition: 'all 0.3s',
                      boxShadow: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'textfield'
                    }}
                    className="placeholder-[#E5E5E5]/50 focus:border-[#00C4BA] focus:shadow-[0_0_10px_rgba(0,196,186,0.5)]"
                    disabled={predicting}
                  />
                  {/* Custom increment/decrement buttons */}
                  <div style={{
                    position: 'absolute',
                    right: '1px',
                    top: '1px',
                    bottom: '1px',
                    display: 'flex',
                    flexDirection: 'column',
                    width: '3.5rem',
                    borderRadius: '0 0.5rem 0.5rem 0'
                  }}>
                    <button
                      type="button"
                      onClick={() => setAmount((prev) => String(Math.max(0, (parseFloat(prev) || 0) + 0.1).toFixed(2)))}
                      disabled={predicting}
                      style={{
                        flex: 1,
                        backgroundColor: '#0088D1',
                        border: 'none',
                        borderRadius: '0 0 0.45rem 0',
                        color: '#0B0C10',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0066A6';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.3)';
                        e.currentTarget.style.transform = 'translateY(2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#0088D1';
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmount((prev) => String(Math.max(0, (parseFloat(prev) || 0) - 0.1).toFixed(2)))}
                      disabled={predicting}
                      style={{
                        flex: 1,
                        backgroundColor: '#0088D1',
                        border: 'none',
                        borderRadius: '0 0 0.45rem 0',
                        color: '#0B0C10',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0066A6';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.3)';
                        e.currentTarget.style.transform = 'translateY(2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#0088D1';
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[#E5E5E5]/50 mt-2">
                  💰 Uses your MarketPredict balance. <Link href="/wallet" className="text-[#00C4BA] hover:underline">Deposit funds here</Link>
                </p>
              </div>

              <div>
                <button
                  onClick={(e) => {
                    if (!amount || Number(amount) <= 0 || !side) {
                      e.preventDefault();
                      setFlashWarning(true);
                      setTimeout(() => setFlashWarning(false), 5000);
                    } else {
                      handlePredict();
                    }
                  }}
                  onMouseEnter={() => {
                    if (!amount || Number(amount) <= 0 || !side) {
                      setFlashWarning(true);
                      setTimeout(() => setFlashWarning(false), 5000);
                    }
                  }}
                  disabled={predicting}
                  className="w-full font-bold disabled:opacity-50 disabled:cursor-not-allowed relative group"
                  style={{
                    padding: '2rem 1rem',
                    fontSize: '1.25rem',
                    borderRadius: '0.75rem',
                    transition: 'all 0.3s ease',
                    backgroundColor: side === "yes" ? '#00FFA3' : (side === "no" ? '#ef4444' : 'transparent'),
                    color: side === "yes" ? '#0B0C10' : '#E5E5E5',
                    border: side === "yes" ? '2px solid #00FFA3' : (side === "no" ? '2px solid #ef4444' : '2px solid #FF6F33'),
                    boxShadow: side === "yes"
                      ? '0 0 30px rgba(0,255,163,0.7)'
                      : (side === "no"
                        ? '0 0 30px rgba(239,68,68,0.7)'
                        : '0 0 14px 3px rgba(255,111,51,0.6), 0 0 26px 6px rgba(255,255,255,0.15)')
                  }}
                >
                  {predicting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="spinner"></span> Placing Prediction...
                    </span>
                  ) : (
                    `Submit ${side ? side.toUpperCase() : 'YES or NO'} Prediction`
                  )}
                </button>
              </div>

              <p className="text-sm text-[#E5E5E5]/60 text-center mt-4">
                🔒 Your prediction is locked until the market resolves
              </p>

              <div className="mt-6 p-4 bg-[#00C4BA]/10 border border-[#00C4BA]/30 rounded-lg">
                <h3 className="text-sm font-bold text-[#00C4BA] mb-2">💡 How Predictions Work</h3>
                <ul className="text-xs text-[#E5E5E5]/80 space-y-1 list-none">
                  <li>• Pick Yes or No, enter crypto amount, click submit</li>
                  <li>• Your prediction joins your side's pool (YES or NO)</li>
                  <li>• If you're right, you win your proportional share of the losing pool</li>
                  <li>• Wins give you your prediction back PLUS your profits (minus 2.9% platform fee)</li>
                  <li>• After market resolves, click "Claim Winnings" to collect your earnings</li>
                  <li>• Predictions are final - you cannot trade or withdraw your prediction until market resolves</li>
                </ul>
              </div>

              {/* Pro Tips Section */}
              <div className="mt-4 p-4 rounded-lg" style={{
                background: 'linear-gradient(135deg, rgba(255,111,51,0.1) 0%, rgba(0,196,186,0.1) 100%)',
                border: '2px solid rgba(255,111,51,0.3)'
              }}>
                <h3 className="text-sm font-bold mb-2" style={{ color: '#FF6F33' }}>🎯 Pro Tips</h3>
                <ul className="text-xs text-[#E5E5E5]/80 space-y-1 list-none">
                  <li>• Watch pool sizes - the smaller your side's pool, the bigger your winnings</li>
                  <li>• Consider market closing date and time before predicting</li>
                  <li>• Diversify across multiple markets to manage risk</li>
                </ul>
              </div>
            </div>
          )}

          {(market.resolved || isExpired) && (
            <div className="border-t border-[#00C4BA]/20 pt-6">
              {market.resolved ? (
                <div className="text-center">
                  <div className="mb-6 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                    <p className="text-purple-400 font-semibold mb-2">✅ Market Resolved</p>
                    <p className="text-[#E5E5E5]/80 text-sm">
                      Outcome: <strong>{market.outcomeYes ? "YES ✓" : "NO ✗"}</strong>
                    </p>
                  </div>
                  <button
                    onClick={handleClaim}
                    disabled={claiming}
                    className="w-full font-bold py-4 px-6 bg-green-500/20 border-2 border-green-500 text-green-400 rounded-lg hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg"
                  >
                    {claiming ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="spinner"></span> Processing...
                      </span>
                    ) : (
                      "💰 Claim Winnings"
                    )}
                  </button>
                  <p className="text-xs text-[#E5E5E5]/60 mt-3">Click above to collect your earnings</p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-[#E5E5E5]/70 mb-4">⏰ This market has expired and is awaiting resolution</p>
                  <p className="text-xs text-[#E5E5E5]/60">The market owner will resolve this market shortly</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}