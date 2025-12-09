"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
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
  paused: boolean;
}

export default function MarketDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
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
  const [isPaused, setIsPaused] = useState(false);

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
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

  const checkOwnership = async () => {
    if (!(window as any).ethereum) return;
    
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setUserAddress(address.toLowerCase());
      setIsOwner(address.toLowerCase() === OWNER_ADDRESS);
    } catch (err) {
      console.error("Error checking ownership:", err);
    }
  };

  const togglePause = async () => {
    const newPausedState = !isPaused;
    
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = newPausedState 
        ? await contract.pauseMarket(id)
        : await contract.unpauseMarket(id);
      await tx.wait();
      
      setSuccessMessage(newPausedState 
        ? "🔒 Market paused - predictions disabled" 
        : "✅ Market unpaused - predictions enabled");
      setTimeout(() => setSuccessMessage(""), 3000);
      
      await loadMarket(); // Reload to get updated paused state
    } catch (err: any) {
      console.error("Error toggling pause:", err);
      setErrorMessage("Failed to " + (newPausedState ? "pause" : "unpause") + " market");
      setTimeout(() => setErrorMessage(""), 3000);
    }
  };

  const loadMarket = async () => {
    try {
      if (!(window as any).ethereum) {
        alert("Please install MetaMask!");
        return;
      }

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const m = await contract.markets(id);
      setMarket({
        question: m.question,
        yesPool: m.yesPool,
        noPool: m.noPool,
        resolved: m.resolved,
        outcomeYes: m.outcomeYes,
        closeTime: m.closeTime,
        paused: m.paused,
      });
      setIsPaused(m.paused);
    } catch (err) {
      console.error("Error loading market:", err);
      alert("Failed to load market");
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
      const tx = await contract.placePrediction(id, side === "yes", amountWei);
      await tx.wait();

      setSuccessMessage(`Prediction placed: ${side.toUpperCase()} for ${amount} BDAG`);
      setTimeout(() => setSuccessMessage(""), 5000);
      setAmount("");
      await loadMarket(); // Reload to update pools
    } catch (err: any) {
      console.error("Error placing prediction:", err);
      console.log("Error reason:", err.reason);
      console.log("Error message:", err.message);
      console.log("Full error object:", JSON.stringify(err, null, 2));
      
      // Handle specific error messages
      let userMessage = "Failed to place prediction";
      
      // Check for insufficient balance in multiple places
      const errorString = JSON.stringify(err).toLowerCase();
      if (errorString.includes("insufficient") || 
          (err.reason && err.reason.toLowerCase().includes("insufficient")) ||
          (err.message && err.message.toLowerCase().includes("insufficient"))) {
        userMessage = "❌ Insufficient balance! Please deposit more crypto to your MarketPredict account.";
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
      setPredicting(false);
    }
  };

  const totalPool = market ? market.yesPool + market.noPool : BigInt(0);
  const yesPercentage = totalPool > BigInt(0) ? Number((market!.yesPool * BigInt(100)) / totalPool) : 50;
  const noPercentage = totalPool > BigInt(0) ? Number((market!.noPool * BigInt(100)) / totalPool) : 50;

  // Calculate potential winnings (after 1.9% fee)
  useEffect(() => {
    if (market && amount && side && Number(amount) > 0) {
      const amountBigInt = ethers.parseEther(amount);
      const fee = (amountBigInt * BigInt(190)) / BigInt(10000); // 1.9% fee
      const amountAfterFee = amountBigInt - fee;
      const winningPool = side === "yes" ? market.yesPool : market.noPool;
      const losingPool = side === "yes" ? market.noPool : market.yesPool;
      
      if (losingPool > BigInt(0)) {
        const newWinningPool = winningPool + amountAfterFee;
        const share = (amountAfterFee * BigInt(10000)) / newWinningPool;
        const winnings = (losingPool * share) / BigInt(10000);
        const totalReturn = amountAfterFee + winnings;
        setPotentialWinnings(ethers.formatEther(totalReturn));
      } else {
        setPotentialWinnings(ethers.formatEther(amountAfterFee));
      }
    } else {
      setPotentialWinnings("0");
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
          <a href="/markets" className="text-[#00C4BA] hover:text-[#00968E]">← Back to Markets</a>
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
          <a href="/markets" className="text-[#00C4BA] hover:text-[#00968E] transition-colors">
            ← Back to Markets
          </a>
          
          {/* Owner-only controls */}
          {isOwner && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Quick Pause/Unpause Toggle */}
              <button
                onClick={togglePause}
                className="px-4 py-2 border-2 rounded-lg font-semibold transition-all text-sm"
                style={{
                  backgroundColor: isPaused ? 'rgba(34,197,94,0.2)' : 'rgba(249,115,22,0.2)',
                  borderColor: isPaused ? '#22c55e' : '#f97316',
                  color: isPaused ? '#22c55e' : '#f97316'
                }}
              >
                {isPaused ? '▶️ Unpause' : '⏸️ Pause'}
              </button>
              
              <button
                onClick={() => {
                  if (!isPaused) {
                    togglePause(); // Auto-pause when editing
                  }
                  alert('Edit functionality coming soon!');
                }}
                className="px-4 py-2 bg-[#0072FF]/20 border-2 border-[#0072FF] text-[#0072FF] rounded-lg font-semibold hover:bg-[#0072FF]/30 transition-all text-sm"
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this market? This action cannot be undone.')) {
                    if (!isPaused) {
                      togglePause(); // Auto-pause when deleting
                    }
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
                {/* Paused Badge (Owner sees always, others see when paused) */}
                {isPaused && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    backgroundColor: 'rgba(249, 115, 22, 0.2)',
                    color: '#f97316',
                    border: '2px solid #f97316',
                    boxShadow: '0 0 25px rgba(249, 115, 22, 0.6)',
                  }}>
                    ⏸️ PAUSED - No Predictions
                  </span>
                )}
                
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
                <option value="Europe/Paris">Paris (CET)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
                <option value="Asia/Dubai">Dubai (GST)</option>
                <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                <option value="Australia/Sydney">Sydney (AEDT)</option>
                <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>Your Local Time</option>
              </select>
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
              <div className="flex justify-between items-center mb-2 text-xs font-bold">
                <span style={{ color: '#00FFA3' }}>YES Odds: {yesPercentage > 0 ? (100 / yesPercentage).toFixed(2) : '∞'}x</span>
                <span style={{ color: '#ef4444' }}>NO Odds: {noPercentage > 0 ? (100 / noPercentage).toFixed(2) : '∞'}x</span>
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
              </div>
            </div>
          </div>

          {/* Prediction Form */}
          {!market.resolved && !isExpired && !isPaused && (
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

              {/* Potential Winnings Display */}
              {amount && side && Number(amount) > 0 && (
                <div className="mb-6 p-6 rounded-lg text-center" style={{
                  background: 'linear-gradient(135deg, rgba(0,255,163,0.15) 0%, rgba(0,196,186,0.15) 100%)',
                  border: '2px solid',
                  borderColor: side === "yes" ? '#00FFA3' : '#ef4444',
                  boxShadow: `0 0 40px ${side === "yes" ? 'rgba(0,255,163,0.4)' : 'rgba(239,68,68,0.4)'}`,
                  animation: 'pulse-glow 2s ease-in-out infinite'
                }}>
                  <div className="text-sm text-[#E5E5E5]/70 mb-1">💰 You'll Take Home If You Win</div>
                  <div className="text-4xl font-bold mb-2" style={{
                    color: side === "yes" ? '#00FFA3' : '#ef4444',
                    textShadow: `0 0 20px ${side === "yes" ? 'rgba(0,255,163,0.8)' : 'rgba(239,68,68,0.8)'}`
                  }}>
                    {Number(potentialWinnings).toFixed(2)} BDAG
                  </div>
                  <div className="text-xs text-[#E5E5E5]/60">
                    {(() => {
                      const profitPercent = ((Number(potentialWinnings) - Number(amount)) / Number(amount) * 100);
                      if (profitPercent > 0) {
                        return `🚀 ${profitPercent.toFixed(1)}% gain on your ${amount} BDAG prediction`;
                      } else if (profitPercent < 0) {
                        return `Net return after platform costs`;
                      } else {
                        return 'Your full prediction returned';
                      }
                    })()}
                  </div>
                </div>
              )}

              <div className="my-6 border-t-2 border-[#00C4BA]/20"></div>

              <div className="mb-4" style={{ marginTop: '2rem' }}>
                {(!amount || Number(amount) <= 0 || !side) && (
                  <div className="mb-6 p-6 bg-orange-500/20 border border-orange-500 rounded-lg text-orange-300 text-center animate-pulse relative" style={{ fontSize: '1.25rem', fontWeight: 'bold', zIndex: 100 }}>
                    <span className="text-2xl" style={{ animation: flashWarning ? 'flash5times 5s ease-in-out' : 'none' }}>⚠️</span> Please pick 'Yes' or 'No' and enter your crypto amount
                  </div>
                )}
                <label className="block text-[#E5E5E5] mb-4 font-bold" style={{ fontSize: '1.5rem' }}>Amount to Predict</label>
                
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
                  💰 Uses your MarketPredict balance. <a href="/wallet" className="text-[#00C4BA] hover:underline">Deposit funds here</a>
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
                  <li>• Your BDAG goes into the pool you choose (YES or NO)</li>
                  <li>• A 1.9% platform fee is deducted from your prediction amount</li>
                  <li>• If you're right, you win a share of the losing pool</li>
                  <li>• Bigger pools mean smaller returns, smaller pools mean bigger wins</li>
                  <li>• You get your original prediction back PLUS your winnings</li>
                </ul>
              </div>

              {/* Pro Tips Section */}
              <div className="mt-4 p-4 rounded-lg" style={{
                background: 'linear-gradient(135deg, rgba(255,111,51,0.1) 0%, rgba(0,196,186,0.1) 100%)',
                border: '2px solid rgba(255,111,51,0.3)'
              }}>
                <h3 className="text-sm font-bold mb-2" style={{ color: '#FF6F33' }}>🎯 Pro Tips</h3>
                <ul className="text-xs text-[#E5E5E5]/80 space-y-1 list-none">
                  <li>• Early predictions often get better odds</li>
                  <li>• Watch pool sizes - smaller pools = higher potential returns</li>
                  <li>• Consider market closing time before placing bets</li>
                  <li>• Diversify across multiple markets to manage risk</li>
                </ul>
              </div>
            </div>
          )}

          {isPaused && !market.resolved && !isExpired && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">⏸️</div>
              <p className="text-xl font-bold text-orange-400 mb-2">Market Paused</p>
              <p className="text-[#E5E5E5]/70">Predictions are temporarily disabled</p>
              {isOwner && (
                <button
                  onClick={togglePause}
                  className="mt-4 px-6 py-3 bg-green-500/20 border-2 border-green-500 text-green-400 rounded-lg font-bold hover:bg-green-500/30 transition-all"
                >
                  ▶️ Unpause Market
                </button>
              )}
            </div>
          )}

          {(market.resolved || isExpired) && (
            <div className="text-center py-6 text-[#E5E5E5]/70">
              {market.resolved ? "This market has been resolved" : "This market has expired and awaits resolution"}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
