"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

// Owner address - only this address can create/edit/delete markets
const OWNER_ADDRESS = "0x539bAA99044b014e453CDa36C4AD3dE5E4575367".toLowerCase();

export default function CreateMarket() {
  const [question, setQuestion] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    checkOwnership();
  }, []);

  const checkOwnership = async () => {
    if (!(window as any).ethereum) return;
    
    try {
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

  const handleCreate = async () => {
    if (!question.trim() || !closeDate) {
      alert("⚠️ Please fill in both the question and close date");
      return;
    }

    if (!(window as any).ethereum) {
      alert("🦊 Please install MetaMask to create markets!");
      return;
    }

    try {
      setLoading(true);
      setSuccess(false);

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      // Convert date to timestamp
      const closeTime = Math.floor(new Date(closeDate).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);

      // Check minimum 3 days in the future
      const threeDays = 3 * 24 * 60 * 60;
      if (closeTime < now + threeDays) {
        alert("📅 Market must stay open at least 3 days to give people time to predict!");
        setLoading(false);
        return;
      }

      const tx = await contract.createMarket(question, closeTime);
      await tx.wait();

      setSuccess(true);
      setQuestion("");
      setCloseDate("");
      
      setTimeout(() => {
        window.location.href = "/markets";
      }, 2000);
    } catch (err: any) {
      console.error("Error creating market:", err);
      alert(err.message || "Failed to create market");
    } finally {
      setLoading(false);
    }
  };

  // Get minimum date (3 days from now)
  const getMinDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().split('T')[0];
  };

  // Get default date (30 days from now)
  const getDefaultDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  };

  // Popular question templates
  const quickQuestions = [
    "Will BDAG stay below $3 by June 2026?",
    "Will Bitcoin reach $150,000 by end of 2026?",
    "Will Ethereum surpass $8,000 by mid 2026?",
    "Will AI replace 50% of customer service jobs by 2027?",
    "Will SpaceX land humans on Mars by 2028?",
    "Will temperatures break records this summer?",
  ];

  const useQuickQuestion = (q: string) => {
    setQuestion(q);
    if (!closeDate) {
      setCloseDate(getDefaultDate());
    }
  };

  // Access denied for non-owners
  if (userAddress && !isOwner) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-[#E5E5E5] mb-4">Access Restricted</h1>
          <p className="text-[#E5E5E5]/70 mb-6">Only the platform owner can create markets.</p>
          <a href="/markets" className="text-[#00C4BA] hover:text-[#00968E] transition-colors">
            ← Back to Markets
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 pt-20 pb-20 relative z-10">
      <div className="w-full max-w-2xl">
        <h1 className="hero-title text-center mb-8">Create New Market</h1>
        
        {/* Quick Create Suggestions */}
        <div className="mb-8 p-6 bg-[#0B0C10] rounded-lg border border-[#0072FF]/30">
          <h2 className="text-lg font-bold text-[#0072FF] mb-3">⚡ Quick Create</h2>
          <p className="text-sm text-[#E5E5E5]/70 mb-4">Click any question to auto-fill:</p>
          <div className="grid gap-2">
            {quickQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => useQuickQuestion(q)}
                className="text-left px-4 py-3 bg-[#1a1d2e] hover:bg-[#1a1d2e]/70 border border-[#00FFA3]/20 hover:border-[#00FFA3] rounded-lg text-[#E5E5E5] text-sm transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        
        <div className="bg-[#1a1d2e] p-8 rounded-lg border border-[#00FFA3]/30 shadow-[0_0_30px_rgba(0,255,163,0.3)]">
          {success && (
            <div className="mb-6 p-4 bg-[#00FFA3]/20 border border-[#00FFA3] rounded-lg text-center slide-in">
              <p className="text-[#00FFA3] font-bold">✅ Market created successfully!</p>
              <p className="text-sm text-[#E5E5E5] mt-2">Redirecting to markets...</p>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-[#00FFA3] font-semibold mb-2">
              Market Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Will BDAG reach $1 by December 2025?"
              className="w-full px-4 py-3 bg-[#0B0C10] border border-[#00FFA3]/50 rounded-lg text-[#E5E5E5] placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#00FFA3] focus:shadow-[0_0_10px_rgba(0,255,163,0.5)]"
              disabled={loading}
            />
            <p className="text-sm text-[#E5E5E5]/70 mt-2">
              💡 Make it clear and verifiable. Include a specific outcome and date.
            </p>
          </div>

          <div className="mb-8">
            <label className="block text-[#00FFA3] font-semibold mb-2">
              Close Date
            </label>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              min={getMinDate()}
              className="w-full px-4 py-3 bg-[#0B0C10] border border-[#00FFA3]/50 rounded-lg text-[#E5E5E5] focus:outline-none focus:border-[#00FFA3] focus:shadow-[0_0_10px_rgba(0,255,163,0.5)]"
              disabled={loading}
            />
            <p className="text-sm text-[#E5E5E5]/70 mt-2">
              ⏰ Market must close at least 3 days in the future
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={loading || !question.trim() || !closeDate}
            className="w-full btn-glow-red py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner"></span> Creating Market...
              </span>
            ) : (
              "+ Create Market"
            )}
          </button>

          <div className="mt-6 p-4 bg-[#0072FF]/10 border border-[#0072FF]/30 rounded-lg">
            <p className="text-sm text-[#E5E5E5]/80">
              🎯 <strong>What happens next:</strong> Once you create a market, anyone can place predictions! 
              The market will close automatically at the date you choose.
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <a href="/markets" className="text-[#00FFA3] hover:text-[#0072FF] transition-colors">
            ← Back to Markets
          </a>
        </div>
      </div>
    </main>
  );
}
