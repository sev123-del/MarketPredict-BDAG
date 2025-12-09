"use client";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

export default function Settings() {
  const [account, setAccount] = useState("");
  const [currentLimit, setCurrentLimit] = useState("0");
  const [newLimit, setNewLimit] = useState("");
  const [restrictDuration, setRestrictDuration] = useState("");
  const [restrictedUntil, setRestrictedUntil] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const PLATFORM_MAX = 500000; // 500,000 BDAG = $25,000 @ $0.05/BDAG
  
  const restrictionPresets = [
    { label: "1 Day", value: 86400 },
    { label: "3 Days", value: 259200 },
    { label: "1 Week", value: 604800 },
    { label: "2 Weeks", value: 1209600 },
    { label: "1 Month", value: 2592000 },
    { label: "3 Months", value: 7776000 },
    { label: "6 Months", value: 15552000 },
    { label: "1 Year", value: 31536000 },
  ];

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (!(window as any).ethereum) return;

    try {
      const accounts = await (window as any).ethereum.request({ 
        method: 'eth_accounts' 
      });
      
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        await loadUserSettings(accounts[0]);
      }
    } catch (err) {
      console.error("Failed to check connection:", err);
    }
  };

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      showMessage("Please install MetaMask!", "error");
      return;
    }

    try {
      const accounts = await (window as any).ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      setAccount(accounts[0]);
      await loadUserSettings(accounts[0]);
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  };

  const loadUserSettings = async (userAddress: string) => {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const limit = await contract.userMarketLimit(userAddress);
      setCurrentLimit(ethers.formatEther(limit));

      const until = await contract.restrictedUntil(userAddress);
      setRestrictedUntil(Number(until));
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const handleSetLimit = async () => {
    if (!newLimit || isNaN(Number(newLimit)) || Number(newLimit) < 0) {
      showMessage("Please enter a valid amount", "error");
      return;
    }

    if (Number(newLimit) > PLATFORM_MAX && Number(newLimit) !== 0) {
      showMessage(`Maximum limit is ${PLATFORM_MAX.toLocaleString()} BDAG ($25,000)`, "error");
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const limitWei = newLimit === "0" ? "0" : ethers.parseEther(newLimit);
      const tx = await contract.setMyMarketLimit(limitWei);
      
      showMessage("⏳ Processing...", "success");
      await tx.wait();

      const limitText = newLimit === "0" 
        ? `Platform maximum (${PLATFORM_MAX.toLocaleString()} BDAG)`
        : `${Number(newLimit).toLocaleString()} BDAG`;
      
      showMessage(`✅ Limit set to ${limitText} per market`, "success");
      setNewLimit("");
      await loadUserSettings(account);
    } catch (err: any) {
      console.error("Set limit failed:", err);
      showMessage(err.message || "❌ Failed to set limit", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRestrict = async (duration: number) => {
    const durationDays = duration / 86400;
    const confirmMsg = `⚠️ ARE YOU SURE?\n\nThis will PREVENT you from placing ANY predictions for ${durationDays} day(s).\n\nThis action CANNOT be undone until the time period expires.\n\nClick OK to confirm restriction.`;
    
    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.restrictMyself(duration);
      
      showMessage("⏳ Processing...", "success");
      await tx.wait();

      showMessage(`✅ You are now restricted from betting for ${durationDays} day(s)`, "success");
      await loadUserSettings(account);
    } catch (err: any) {
      console.error("Restriction failed:", err);
      showMessage(err.message || "❌ Failed to set restriction", "error");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg: string, type: "success" | "error") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 5000);
  };

  const isCurrentlyRestricted = restrictedUntil > Date.now() / 1000;
  const restrictionEndDate = new Date(restrictedUntil * 1000);

  return (
    <main className="min-h-screen px-4 pt-20 pb-20 relative z-10">
      <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
        <h1 className="text-4xl font-bold text-[#00FFA3] mb-8 text-center">
          🛡️ Responsible Gambling Settings
        </h1>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg border-2 ${
              messageType === "success"
                ? "bg-green-500/20 border-green-500 text-green-400"
                : "bg-red-500/20 border-red-500 text-red-400"
            }`}
          >
            {message}
          </div>
        )}

        {!account ? (
          <div className="text-center py-20">
            <p className="text-xl text-[#E5E5E5] mb-6">
              Connect your wallet to manage your limits and restrictions
            </p>
            <button
              onClick={connectWallet}
              className="px-8 py-4 bg-[#00C4BA] text-[#0B0C10] font-bold rounded-lg hover:bg-[#00968E] transition-all shadow-[0_0_30px_rgba(0,196,186,0.5)]"
            >
              🦊 Connect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Restriction Status */}
            {isCurrentlyRestricted && (
              <div className="bg-red-500/20 border-2 border-red-500 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-red-400 mb-2">
                  🚫 Currently Restricted
                </h2>
                <p className="text-[#E5E5E5]">
                  You cannot place predictions until:{" "}
                  <strong className="text-red-400">
                    {restrictionEndDate.toLocaleString()}
                  </strong>
                </p>
              </div>
            )}

            {/* Per-Market Limit */}
            <div className="bg-[#1a1d2e] p-6 rounded-lg border border-[#00C4BA]/30 shadow-[0_0_30px_rgba(0,196,186,0.3)]">
              <h2 className="text-2xl font-bold text-[#00FFA3] mb-4">
                💰 Per-Market Spending Limit
              </h2>
              
              <div className="mb-4">
                <p className="text-[#E5E5E5] mb-2">
                  <strong>Current Limit:</strong>{" "}
                  {currentLimit === "0.0" || currentLimit === "0"
                    ? `Platform Maximum (${PLATFORM_MAX.toLocaleString()} BDAG)`
                    : `${Number(currentLimit).toLocaleString()} BDAG`}
                </p>
                <p className="text-sm text-[#E5E5E5]/70">
                  Platform maximum per market: {PLATFORM_MAX.toLocaleString()} BDAG ($25,000 @ $0.05/BDAG)
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-semibold text-[#E5E5E5]">
                  Set New Limit (BDAG)
                </label>
                <input
                  type="number"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  placeholder={`Enter amount (0 for platform max of ${PLATFORM_MAX.toLocaleString()})`}
                  className="w-full p-3 bg-[#0B0C10] border border-[#00C4BA]/50 rounded-lg text-[#E5E5E5] focus:outline-none focus:border-[#00C4BA] focus:shadow-[0_0_10px_rgba(0,196,186,0.5)]"
                  disabled={loading}
                />
                <button
                  onClick={handleSetLimit}
                  disabled={loading || !newLimit}
                  className="w-full px-6 py-3 bg-[#00C4BA] text-[#0B0C10] font-bold rounded-lg hover:bg-[#00968E] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,196,186,0.5)]"
                >
                  {loading ? "Processing..." : "Set Limit"}
                </button>
              </div>

              <div className="mt-4 p-3 bg-[#0B0C10] rounded-lg border border-yellow-500/50">
                <p className="text-sm text-yellow-400">
                  💡 <strong>Tip:</strong> Set 0 to use the platform maximum. Once set, you cannot exceed this limit per market.
                </p>
              </div>
            </div>

            {/* Self-Restriction */}
            <div className="bg-[#1a1d2e] p-6 rounded-lg border border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.3)]">
              <h2 className="text-2xl font-bold text-orange-400 mb-4">
                ⏸️ Self-Restriction (Take a Break)
              </h2>
              
              <p className="text-[#E5E5E5] mb-4">
                Restrict yourself from placing ANY predictions for a set period of time.
                <strong className="text-orange-400"> This cannot be undone!</strong>
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {restrictionPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => handleRestrict(preset.value)}
                    disabled={loading || isCurrentlyRestricted}
                    className="px-4 py-3 bg-orange-500/20 border-2 border-orange-500 text-orange-400 rounded-lg font-semibold hover:bg-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 p-3 bg-red-500/10 rounded-lg border border-red-500/50">
                <p className="text-sm text-red-400">
                  ⚠️ <strong>Warning:</strong> Once activated, you will NOT be able to place predictions until the time period expires. Use this if you need to take a break.
                </p>
              </div>
            </div>

            {/* Info Section */}
            <div className="bg-[#1a1d2e] p-6 rounded-lg border border-[#00C4BA]/30">
              <h2 className="text-xl font-bold text-[#00FFA3] mb-3">
                ℹ️ About These Settings
              </h2>
              <div className="space-y-2 text-sm text-[#E5E5E5]/80">
                <p>
                  • <strong>Per-Market Limit:</strong> Maximum BDAG you can bet on any single market
                </p>
                <p>
                  • <strong>Self-Restriction:</strong> Completely blocks you from betting for the chosen period
                </p>
                <p>
                  • <strong>All changes are final:</strong> These settings are enforced by the smart contract
                </p>
                <p>
                  • <strong>Responsible gambling:</strong> Use these tools to stay in control of your betting
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
