"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

// Owner address - only this address can create/edit/delete markets
const OWNER_ADDRESS = "0x539bAA99044b014e453CDa36C4AD3dE5E4575367".toLowerCase();

export default function CreateMarket() {
  const [question, setQuestion] = useState("");
  const [closeDateTime, setCloseDateTime] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago"); // Default to Central Time
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [checkingOwnership, setCheckingOwnership] = useState(true);

  useEffect(() => {
    checkOwnership();
  }, []);

  const checkOwnership = async () => {
    if (!(window as any).ethereum) {
      setCheckingOwnership(false);
      return;
    }
    
    try {
      // Check if accounts are already connected
      const accounts = await (window as any).ethereum.request({ 
        method: 'eth_accounts' 
      });
      
      if (accounts.length > 0) {
        const address = accounts[0].toLowerCase();
        setUserAddress(address);
        setIsOwner(address === OWNER_ADDRESS);
      }
      
      setCheckingOwnership(false);
    } catch (err: any) {
      console.error("Error checking ownership:", err);
      setCheckingOwnership(false);
    }
  };

  const handleCreate = async () => {
    if (!question.trim() || !closeDateTime) {
      alert("⚠️ Please fill in both the question and close date/time");
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

      // Convert date/time in selected timezone to UTC timestamp
      const dateTimeString = closeDateTime;
      
      // Parse the datetime-local value and interpret it as the selected timezone
      const [datePart, timePart] = dateTimeString.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      
      // Create a date string in the format that includes timezone info
      const dateInTimezone = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
      
      // Get timezone offset in minutes
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      // Create the date in the selected timezone
      const parts = formatter.formatToParts(dateInTimezone);
      const tzYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
      const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0');
      const tzDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
      const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
      const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
      
      // Create UTC date by treating input as the selected timezone
      const localDate = new Date(year, month - 1, day, hour, minute, 0);
      const tzDate = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, 0));
      const offset = tzDate.getTime() - dateInTimezone.getTime();
      const utcDate = new Date(localDate.getTime() - offset);
      
      const closeTime = Math.floor(utcDate.getTime() / 1000);
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
      setCloseDateTime("");
      
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

  // Get minimum datetime (3 days from now)
  const getMinDateTime = () => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().slice(0, 16);
  };

  // Get default datetime (30 days from now at noon)
  const getDefaultDateTime = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    date.setHours(12, 0, 0, 0);
    return date.toISOString().slice(0, 16);
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
    if (!closeDateTime) {
      setCloseDateTime(getDefaultDateTime());
    }
  };

  // Show loading while checking ownership
  if (checkingOwnership) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-xl text-[#00FFA3]">Checking permissions...</p>
        </div>
      </main>
    );
  }

  // Require wallet connection
  if (!userAddress) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-[#E5E5E5] mb-4">Wallet Required</h1>
          <p className="text-[#E5E5E5]/70 mb-6">Please connect your wallet to access this page.</p>
          <a href="/markets" className="text-[#00C4BA] hover:text-[#00968E] transition-colors">
            ← Back to Markets
          </a>
        </div>
      </main>
    );
  }

  // Access denied for non-owners
  if (!isOwner) {
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

          <div className="mb-6">
            <label className="block text-[#00FFA3] font-semibold mb-2">
              Close Date & Time
            </label>
            <input
              type="datetime-local"
              value={closeDateTime}
              onChange={(e) => setCloseDateTime(e.target.value)}
              min={getMinDateTime()}
              className="w-full px-4 py-3 bg-[#0B0C10] border border-[#00FFA3]/50 rounded-lg text-[#E5E5E5] focus:outline-none focus:border-[#00FFA3] focus:shadow-[0_0_10px_rgba(0,255,163,0.5)]"
              disabled={loading}
            />
            <p className="text-sm text-[#E5E5E5]/70 mt-2">
              ⏰ Select the date and time when the market should close
            </p>
          </div>

          <div className="mb-8">
            <label className="block text-[#00FFA3] font-semibold mb-2">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 py-3 bg-[#0B0C10] border border-[#00FFA3]/50 rounded-lg text-[#E5E5E5] focus:outline-none focus:border-[#00FFA3] focus:shadow-[0_0_10px_rgba(0,255,163,0.5)]"
              disabled={loading}
            >
              <option value="Pacific/Honolulu">UTC-10 - Honolulu, Hawaii</option>
              <option value="America/Anchorage">UTC-9 - Anchorage, Alaska</option>
              <option value="America/Los_Angeles">UTC-8 - Los Angeles, San Francisco (PST)</option>
              <option value="America/Denver">UTC-7 - Denver, Phoenix (MST)</option>
              <option value="America/Chicago">UTC-6 - Chicago, Dallas (CST) ⭐</option>
              <option value="America/New_York">UTC-5 - New York, Miami (EST)</option>
              <option value="America/Caracas">UTC-4 - Caracas, Venezuela</option>
              <option value="America/Sao_Paulo">UTC-3 - São Paulo, Buenos Aires</option>
              <option value="Atlantic/South_Georgia">UTC-2 - South Georgia</option>
              <option value="Atlantic/Azores">UTC-1 - Azores, Cape Verde</option>
              <option value="Europe/London">UTC+0 - London, Dublin (GMT)</option>
              <option value="Europe/Paris">UTC+1 - Paris, Berlin, Rome</option>
              <option value="Europe/Athens">UTC+2 - Athens, Cairo, Johannesburg</option>
              <option value="Europe/Moscow">UTC+3 - Moscow, Istanbul, Riyadh</option>
              <option value="Asia/Dubai">UTC+4 - Dubai, Abu Dhabi</option>
              <option value="Asia/Karachi">UTC+5 - Karachi, Islamabad</option>
              <option value="Asia/Dhaka">UTC+6 - Dhaka, Bangladesh</option>
              <option value="Asia/Bangkok">UTC+7 - Bangkok, Jakarta, Hanoi</option>
              <option value="Asia/Hong_Kong">UTC+8 - Hong Kong, Singapore, Beijing</option>
              <option value="Asia/Tokyo">UTC+9 - Tokyo, Seoul, Osaka</option>
              <option value="Australia/Sydney">UTC+10 - Sydney, Melbourne</option>
              <option value="Pacific/Noumea">UTC+11 - Noumea, Solomon Islands</option>
              <option value="Pacific/Auckland">UTC+12 - Auckland, Fiji</option>
            </select>
            <p className="text-sm text-[#E5E5E5]/70 mt-2">
              🌍 Market will close at the time you entered in the selected timezone (⭐ = Default)
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={loading || !question.trim() || !closeDateTime}
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
