import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI as CONTRACT_ABI_RAW } from "../configs/contractConfig";
import { isAllowedCreator } from "../configs/creators";

const CONTRACT_ABI = Array.isArray(CONTRACT_ABI_RAW[0]) ? CONTRACT_ABI_RAW[0] : CONTRACT_ABI_RAW;

declare global {
  interface Window {
    ethereum?: any;
  }
}

const PRICE_FEEDS: { [key: string]: string } = {
  "BTC/USD": "0x0000000000000000000000000000000000000000",
  "ETH/USD": "0x0000000000000000000000000000000000000000",
  "BDAG/USD": "0x0000000000000000000000000000000000000000"
};

// Timezone options with example cities
const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska Time (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Honolulu)" },
  { value: "Europe/London", label: "GMT (London)" },
  { value: "Europe/Paris", label: "Central European (Paris)" },
  { value: "Europe/Moscow", label: "Moscow Standard Time" },
  { value: "Asia/Dubai", label: "Gulf Standard (Dubai)" },
  { value: "Asia/Kolkata", label: "India Standard (New Delhi)" },
  { value: "Asia/Bangkok", label: "Indochina (Bangkok)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time" },
  { value: "Asia/Tokyo", label: "Japan Standard (Tokyo)" },
  { value: "Asia/Seoul", label: "Korea Standard (Seoul)" },
  { value: "Australia/Sydney", label: "Australian Eastern (Sydney)" },
  { value: "Pacific/Auckland", label: "New Zealand Standard (Auckland)" },
];

export default function CreateMarket() {
  const router = useRouter();

  const [marketType, setMarketType] = useState<"manual" | "oracle">("manual");
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [closeDateLocal, setCloseDateLocal] = useState("");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [priceSymbol, setPriceSymbol] = useState("BTC/USD");
  const [targetPrice, setTargetPrice] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [txStatus, setTxStatus] = useState("");
  const [error, setError] = useState("");
  const [account, setAccount] = useState<string>("");
  const [owner, setOwner] = useState<string>("");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    checkOwner();
  }, []);

  const checkAndSwitchNetwork = async () => {
    if (!(window as any).ethereum) return;

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== BigInt(1043)) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x413' }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x413',
                chainName: 'BDAG Testnet',
                nativeCurrency: { name: 'BDAG', symbol: 'BDAG', decimals: 18 },
                rpcUrls: [''],
                blockExplorerUrls: ['https://explorer.testnet.blockdag.network']
              }],
            });
          }
        }
      }
    } catch (error) {
      console.error('Error checking network:', error);
    }
  };

  const checkOwner = async () => {
    try {
      if (!(window as any).ethereum) {
        setError("Please install MetaMask");
        return;
      }

      const accounts = await (window as any).ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (!accounts || accounts.length === 0) {
        setError("Please connect your wallet");
        return;
      }

      const address = accounts[0].toLowerCase();
      setAccount(address);

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      try {
        const contractOwner = await contract.owner();
        const ownerAddress = String(contractOwner).toLowerCase();
        setOwner(ownerAddress);

        console.log("User address:", address);
        console.log("Contract owner:", ownerAddress);

        if (address === ownerAddress) {
          setIsOwner(true);
        } else {
          // allow off-chain allowlist members
          if (isAllowedCreator(address)) {
            setIsOwner(false);
            // mark as allowed via off-chain list by clearing error
            setError("");
          } else {
            setError(`Access denied. Your address: ${address.slice(0, 6)}...${address.slice(-4)}. Owner: ${ownerAddress.slice(0, 6)}...${ownerAddress.slice(-4)}`);
            setIsOwner(false);
          }
        }
      } catch (contractErr: any) {
        console.error("Failed to read contract owner:", contractErr);
        const msg = contractErr?.message || String(contractErr);
        setError(`Failed to verify owner: ${msg}`);
      }

      await checkAndSwitchNetwork();
    } catch (err: any) {
      console.error("Error:", err);
      setError("Failed to verify owner status");
    }
  };

  // Convert local datetime string + timezone to Unix timestamp
  const getUnixTimestamp = (localDateTimeStr: string, tz: string): number => {
    if (!localDateTimeStr) return 0;

    // Parse the local datetime string (format: YYYY-MM-DDTHH:mm)
    const [datePart, timePart] = localDateTimeStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);

    // Create a date in the specified timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Get the offset between UTC and the target timezone
    const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
    const tzDate = new Date(utcDate.toLocaleString('en-US', { timeZone: tz }));
    const offset = utcDate.getTime() - tzDate.getTime();

    // Adjust to get the correct UTC time
    const correctUtcDate = new Date(utcDate.getTime() + offset);

    return Math.floor(correctUtcDate.getTime() / 1000);
  };

  const validateInputs = (): string | null => {
    if (!question || question.trim().length === 0) {
      return "Please enter a question";
    }
    if (question.length > 500) {
      return "Question too long (max 500 characters)";
    }
    if (question.length < 10) {
      return "Question too short (min 10 characters)";
    }
    if (!closeDateLocal) {
      return "Please select a closing date and time";
    }

    const endTimestamp = getUnixTimestamp(closeDateLocal, timezone);
    const now = Math.floor(Date.now() / 1000);

    if (isNaN(endTimestamp) || endTimestamp <= now) {
      return "Closing time must be in the future";
    }

    if (marketType === "oracle") {
      if (!targetPrice || parseFloat(targetPrice) <= 0) {
        return "Please enter a valid target price";
      }
      if (!priceSymbol) {
        return "Please select a price feed";
      }
    }

    return null;
  };

  const createMarketTransaction = async () => {
    const validationError = validateInputs();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsLoading(true);
    setTxStatus("Creating market...");

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const endTimestamp = getUnixTimestamp(closeDateLocal, timezone);
      const durationSeconds = endTimestamp - Math.floor(Date.now() / 1000);

      const mktType = marketType === "oracle" ? 1 : 0;

      const priceFeedAddress = marketType === "oracle"
        ? PRICE_FEEDS[priceSymbol]
        : "0x0000000000000000000000000000000000000000";

      const parsedTargetPrice = marketType === "oracle"
        ? ethers.parseEther(targetPrice)
        : 0;

      const tx = await contract.createMarket(
        question,
        description,
        category,
        durationSeconds,
        mktType,
        priceFeedAddress,
        parsedTargetPrice
      );
      setTxStatus(`Transaction submitted: ${tx.hash}`);

      // Poll for transaction receipt with timeout (3 minutes)
      const start = Date.now();
      const timeoutMs = 3 * 60 * 1000;
      let receipt: any = null;
      try {
        while (Date.now() - start < timeoutMs) {
          receipt = await provider.getTransactionReceipt(tx.hash);
          if (receipt && receipt.blockNumber) break;
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (pollErr) {
        console.error('Polling tx receipt error:', pollErr);
      }

      if (receipt && receipt.blockNumber) {
        setTxStatus('✅ Market created successfully!');
        setTimeout(() => router.push('/markets'), 1500);
      } else {
        // show user the pending status and link to explorer
        const explorerUrl = `https://explorer.testnet.blockdag.network/tx/${tx.hash}`;
        setTxStatus(`Transaction pending — view on explorer: ${explorerUrl}`);
      }
    } catch (err: any) {
      console.error("Error creating market:", err);
      if (err.code === "ACTION_REJECTED") {
        setError("Transaction rejected by user");
      } else if (err.message?.includes("only owner")) {
        setError("❌ Only the contract owner can create markets");
      } else {
        setError(err.message || "Failed to create market. Please try again.");
      }
    } finally {
      setIsLoading(false);
      setTxStatus("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMarketTransaction();
  };

  if (!account || !owner) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 pt-20 pb-20 relative z-10">
        <div className="text-center">
          <p className="text-lg md:text-xl text-[#7C8BA0]">Verifying ownership...</p>
        </div>
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 pt-20 pb-20 relative z-10">
        <div className="text-center max-w-md w-full">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#C07070] mb-4">Access Denied</h1>
          <p className="text-base md:text-lg text-[#7C8BA0]/70 mb-8">
            Only the contract owner can create markets.
          </p>
          <a href="/" className="inline-block w-full md:w-auto px-8 py-3 md:py-4 bg-[#5B7C99] hover:bg-[#5B7C99]/80 text-[#E5E5E5] font-semibold rounded-lg transition-all">
            ← Back Home
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 pt-20 pb-20 relative z-10">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#E5E5E5] mb-3 md:mb-4">Create Market</h1>
          <p className="text-base md:text-lg text-[#7C8BA0]">
            Set up a new prediction market
          </p>
        </div>

        {/* Error/Status Messages */}
        {error && (
          <div className="mb-6 sm:mb-8 p-4 sm:p-5 rounded-lg border border-[#C07070] bg-[#C07070]/15 text-[#C07070] text-center font-semibold text-sm md:text-base">
            {error}
          </div>
        )}
        {txStatus && (
          <div className="mb-6 sm:mb-8 p-4 sm:p-5 rounded-lg border border-[#5B7C99] bg-[#5B7C99]/15 text-[#5B7C99] text-center font-semibold text-sm md:text-base">
            {txStatus}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-[#1a1d2e] p-6 sm:p-8 rounded-lg border border-[#5B7C99]/30 shadow-[0_0_20px_rgba(91,124,153,0.2)] space-y-6 sm:space-y-8">

          {/* Market Type */}
          <div>
            <label className="block text-base md:text-lg text-[#7C8BA0] font-semibold mb-4">
              Market Type *
            </label>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setMarketType("manual")}
                className={`p-4 sm:p-6 rounded-lg border-2 transition-all ${marketType === "manual"
                  ? "border-[#5B7C99] bg-[#5B7C99]/10"
                  : "border-[#E5E5E5]/20 bg-[#0B0C10] hover:border-[#5B7C99]/50"
                  }`}
              >
                <div className="font-semibold text-base md:text-lg text-[#7C8BA0]">Manual</div>
                <div className="text-xs md:text-sm text-[#7C8BA0]/60 mt-2">You resolve</div>
              </button>
              <button
                type="button"
                onClick={() => setMarketType("oracle")}
                className={`p-4 sm:p-6 rounded-lg border-2 transition-all ${marketType === "oracle"
                  ? "border-[#5B7C99] bg-[#5B7C99]/10"
                  : "border-[#E5E5E5]/20 bg-[#0B0C10] hover:border-[#5B7C99]/50"
                  }`}
              >
                <div className="font-semibold text-base md:text-lg text-[#7C8BA0]">Oracle</div>
                <div className="text-xs md:text-sm text-[#7C8BA0]/60 mt-2">Auto-resolves</div>
              </button>
            </div>
          </div>

          {/* Question */}
          <div>
            <label className="block text-base md:text-lg text-[#7C8BA0] font-semibold mb-3">
              Market Question *
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., Will BTC exceed $100K by Dec 31, 2025?"
              maxLength={500}
              rows={4}
              className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[#0B0C10] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[#E5E5E5] placeholder-[#7C8BA0]/30 focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)] resize-none"
            />
            <div className="text-xs sm:text-sm text-[#7C8BA0]/50 mt-3">
              {question.length}/500 characters
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-base md:text-lg text-[#7C8BA0] font-semibold mb-3">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details about resolution criteria..."
              rows={3}
              className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[#0B0C10] border-2 border-[#5B7C99]/50 rounded-lg text-base md:text-lg text-[#E5E5E5] placeholder-[#7C8BA0]/30 focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)] resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-base md:text-lg text-[#7C8BA0] font-semibold mb-3">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[#0B0C10] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[#E5E5E5] focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)]"
            >
              <option value="General">General</option>
              <option value="Crypto">Crypto</option>
              <option value="World">World</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Tech">Tech</option>
              <option value="Weather">Weather</option>
              <option value="Finance">Finance</option>
            </select>
          </div>

          {/* Timezone Selection */}
          <div>
            <label className="block text-base md:text-lg text-[#7C8BA0] font-semibold mb-3">
              Timezone *
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[#0B0C10] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[#E5E5E5] focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)]"
            >
              {TIMEZONE_OPTIONS.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <div className="text-xs sm:text-sm text-[#7C8BA0]/50 mt-2">
              Select your timezone - the closing time will be calculated relative to this zone
            </div>
          </div>

          {/* Closing Date/Time */}
          <div>
            <label className="block text-base md:text-lg text-[#7C8BA0] font-semibold mb-3">
              Closing Date & Time *
            </label>
            <input
              type="datetime-local"
              value={closeDateLocal}
              onChange={(e) => setCloseDateLocal(e.target.value)}
              required
              className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[#0B0C10] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[#E5E5E5] focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)]"
            />
            {closeDateLocal && (
              <div className="text-xs sm:text-sm text-[#7C8BA0]/60 mt-3">
                Closes in {timezone}: {new Date(closeDateLocal).toLocaleString()}
              </div>
            )}
          </div>

          {/* Oracle Fields */}
          {marketType === "oracle" && (
            <>
              <div>
                <label className="block text-base md:text-lg text-[#7C8BA0] font-semibold mb-3">
                  Price Feed *
                </label>
                <select
                  value={priceSymbol}
                  onChange={(e) => setPriceSymbol(e.target.value)}
                  required
                  className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[#0B0C10] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[#E5E5E5] focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)]"
                >
                  <option value="BTC/USD">BTC/USD (Bitcoin)</option>
                  <option value="ETH/USD">ETH/USD (Ethereum)</option>
                  <option value="BDAG/USD">BDAG/USD (BlockDAG)</option>
                </select>
                <div className="text-xs sm:text-sm text-[#D4A574] mt-3">
                  ⚠️ Feeds may not be available on testnet
                </div>
              </div>

              <div>
                <label className="block text-base md:text-lg text-[#7C8BA0] font-semibold mb-3">
                  Target Price (USD) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="e.g., 100000"
                  required
                  className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[#0B0C10] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[#E5E5E5] placeholder-[#7C8BA0]/30 focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)]"
                />
                {targetPrice && (
                  <div className="text-xs sm:text-sm text-[#7C8BA0]/60 mt-3">
                    Resolves YES if {priceSymbol} goes above ${targetPrice}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 sm:py-5 text-base md:text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg bg-[#5B7C99] hover:bg-[#5B7C99]/80 text-[#E5E5E5] transition-all"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner"></span> Creating...
              </span>
            ) : (
              `Create ${marketType === "manual" ? "Manual" : "Oracle"} Market`
            )}
          </button>
        </form>

        {/* Back Link */}
        <div className="text-center pt-4">
          <a href="/markets" className="text-base md:text-lg text-[#5B7C99] hover:text-[#7C8BA0] transition-colors">
            ← Back to Markets
          </a>
        </div>
      </div >
    </main >
  );
}