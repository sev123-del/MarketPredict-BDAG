import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import Link from 'next/link';
import { ethers } from "ethers";
import logger from "../lib/logger";
import { CONTRACT_ADDRESS, CONTRACT_ABI as CONTRACT_ABI_RAW } from "../configs/contractConfig";
import { isAllowedCreator } from "../configs/creators";
import { useWallet } from "../context/WalletContext";

const CONTRACT_ABI = Array.isArray(CONTRACT_ABI_RAW[0]) ? CONTRACT_ABI_RAW[0] : CONTRACT_ABI_RAW;
import { MARKET_CATEGORIES_NO_ALL } from '../configs/marketCategories';

declare global {
  interface Window {
    ethereum?: {
      request?: (opts: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
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

function categoryKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, ' ');
}

export default function CreateMarket() {
  const router = useRouter();
  const { account, ethereum, connect } = useWallet();

  // Minimal ABI fragments for creator/admin actions (avoid full ABI regen)
  const CREATOR_ABI = [
    "function owner() view returns (address)",
    "function globalPaused() view returns (bool)",
    "function setGlobalPause(bool pause)",
    "function marketCount() view returns (uint256)",
    "function getMarket(uint256 id) view returns (string question, uint256 closeTime, uint256 status, bool outcome, uint256 yesPool, uint256 noPool, address creator, uint256 marketType)",
    "function getMarketAdmin(uint256 id) view returns (address creator, bool paused, bool disputeUsed, bool disputeActive, address disputeOpener, uint256 disputeBond)",
    "function setMarketPause(uint256 id, bool pause)",
    "function editMarket(uint256 id, string question, string description, string category)",
  ];

  const [marketType, setMarketType] = useState<"manual" | "oracle">("manual");
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [closeDateLocal, setCloseDateLocal] = useState("");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [priceSymbol, setPriceSymbol] = useState("BTC/USD");
  const [targetPrice, setTargetPrice] = useState("");

  const categoryOptions = useMemo(() => MARKET_CATEGORIES_NO_ALL, []);

  const setCategoryNormalized = (raw: string) => {
    const nextKey = categoryKey(raw);
    const match = categoryOptions.find((c) => categoryKey(c) === nextKey);
    setCategory(match || 'General');
  };

  const [isLoading, setIsLoading] = useState(false);
  const [txStatus, setTxStatus] = useState("");
  const [error, setError] = useState("");
  const [owner, setOwner] = useState<string>("");
  const [isOwner, setIsOwner] = useState(false);

  const [isContractOwner, setIsContractOwner] = useState(false);
  const [globalPausedState, setGlobalPausedState] = useState(false);

  // Draft queue (bot suggestions + fast approval)
  type Draft = {
    id: number;
    status: 'pending' | 'approved' | 'rejected';
    question: string;
    description: string;
    category: string;
    closeTimeIso: string;
    marketType: 'manual' | 'oracle';
    priceFeed?: string;
    targetPrice?: string;
  };
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState('');
  const [draftsStatus, setDraftsStatus] = useState('');

  type CreatorMarket = {
    id: number;
    question: string;
    closeTime: bigint;
    status: number;
    paused: boolean;
    disputeUsed: boolean;
    disputeActive: boolean;
  };

  const [creatorMarkets, setCreatorMarkets] = useState<CreatorMarket[]>([]);
  const [manageError, setManageError] = useState<string>("");
  const [manageStatus, setManageStatus] = useState<string>("");
  const [editingMarketId, setEditingMarketId] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");



  type InjectedEthereum = { request: (opts: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown> };

  const checkAndSwitchNetwork = useCallback(async () => {
    const eth = (ethereum as unknown as InjectedEthereum | null) ?? null;
    if (!eth) return;

    try {
      const provider = new ethers.BrowserProvider(eth as InjectedEthereum);
      const network = await provider.getNetwork();

      if (network.chainId !== BigInt(1043)) {
        try {
          await eth.request?.({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x413' }],
          });
        } catch (switchError) {
          const se = switchError as { code?: number };
          if (se.code === 4902) {
            await eth.request?.({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x413',
                chainName: 'BDAG Testnet',
                nativeCurrency: { name: 'BDAG', symbol: 'BDAG', decimals: 18 },
                rpcUrls: (process.env.NEXT_PUBLIC_READ_RPC || '').trim() ? [(process.env.NEXT_PUBLIC_READ_RPC || '').trim()] : [],
                blockExplorerUrls: ['https://explorer.testnet.blockdag.network']
              }],
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error checking network:', error);
    }
  }, [ethereum]);

  const checkOwner = useCallback(async () => {
    try {
      const eth = (ethereum as unknown as InjectedEthereum | null) ?? null;
      if (!eth) {
        setError("Please install MetaMask");
        return;
      }

      const addr = account || (await connect());
      if (!addr) {
        setError("Please connect your wallet");
        return;
      }

      const address = addr.toLowerCase();

      const provider = new ethers.BrowserProvider(eth as InjectedEthereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      try {
        const contractOwner = await contract.owner();
        const ownerAddress = String(contractOwner).toLowerCase();
        setOwner(ownerAddress);

        logger.debug('User address:', address);
        logger.debug('Contract owner:', ownerAddress);

        // On-chain auth: owner OR market writer. Keep legacy allowlist as a UX fallback.
        let isWriter = false;
        try {
          // This will work after redeploying with the updated contract + ABI.
          isWriter = Boolean(await contract.marketWriters(address));
        } catch {
          isWriter = false;
        }

        const allowedCreator = isAllowedCreator(address);
        const authorized = address === ownerAddress || isWriter || allowedCreator;
        setIsOwner(authorized);
        setIsContractOwner(address === ownerAddress);
        if (authorized) {
          setError("");
        } else {
          setError(`Access denied. Your address: ${address.slice(0, 6)}...${address.slice(-4)}. Owner: ${ownerAddress.slice(0, 6)}...${ownerAddress.slice(-4)}`);
        }
      } catch (contractErr) {
        logger.error('Failed to read contract owner:', contractErr);
        const ce = contractErr as { message?: string };
        const msg = ce?.message || String(contractErr);
        setError(`Failed to verify owner: ${msg}`);
      }

      await checkAndSwitchNetwork();
    } catch (err) {
      logger.error('Error:', err);
      setError("Failed to verify owner status");
    }
  }, [account, connect, checkAndSwitchNetwork, ethereum]);

  useEffect(() => {
    checkOwner();
  }, [checkOwner]);

  const loadDrafts = useCallback(async () => {
    setDraftsError('');
    setDraftsStatus('');
    setDraftsLoading(true);
    try {
      const res = await fetch('/api/drafts?status=pending');
      if (!res.ok) throw new Error('Failed to load drafts');
      const json = await res.json();
      const arr = Array.isArray(json?.drafts) ? (json.drafts as Draft[]) : [];
      setDrafts(arr);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setDraftsError(err?.message || 'Failed to load drafts');
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    loadDrafts();
  }, [isOwner, loadDrafts]);

  const signDraftAction = async (action: 'approve' | 'reject', draftId: number) => {
    const eth = (ethereum as unknown as InjectedEthereum | null) ?? null;
    if (!eth) throw new Error('Wallet not connected');
    const provider = new ethers.BrowserProvider(eth as InjectedEthereum);
    const signer = await provider.getSigner();
    const address = (await signer.getAddress()).toLowerCase();
    const issuedAt = new Date().toISOString();

    // Fetch a one-time nonce from the server to prevent signature replay.
    const challengeRes = await fetch(`/api/drafts?mode=challenge&address=${encodeURIComponent(address)}`);
    const challengeJson = await challengeRes.json().catch(() => ({}));
    if (!challengeRes.ok) throw new Error(challengeJson?.error || 'Failed to get draft challenge');
    const nonce = String(challengeJson?.nonce || '');
    if (!nonce) throw new Error('Missing server nonce');

    const msg = `MarketPredict Draft Action\nAction: ${action}\nDraftId: ${draftId}\nIssuedAt: ${issuedAt}\nNonce: ${nonce}`;
    // EIP-191 personal_sign
    const signature = await signer.signMessage(msg);
    return { address, signature, issuedAt, nonce };
  };

  const setDraftStatus = async (action: 'approve' | 'reject', draftId: number) => {
    setDraftsError('');
    setDraftsStatus(action === 'approve' ? 'Approving draft...' : 'Rejecting draft...');
    try {
      const { address, signature, issuedAt, nonce } = await signDraftAction(action, draftId);
      const res = await fetch('/api/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: draftId, address, signature, issuedAt, nonce }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Draft update failed');
      setDraftsStatus(action === 'approve' ? 'Draft approved' : 'Draft rejected');
      await loadDrafts();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setDraftsError(err?.message || 'Draft update failed');
    } finally {
      setTimeout(() => setDraftsStatus(''), 1500);
    }
  };

  const loadDraftIntoForm = (d: Draft) => {
    setMarketType(d.marketType);
    setQuestion(d.question || '');
    setDescription(d.description || '');
    setCategoryNormalized(d.category || 'General');
    try {
      // Convert ISO -> datetime-local value
      const dt = new Date(d.closeTimeIso);
      const pad = (n: number) => String(n).padStart(2, '0');
      const v = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      setCloseDateLocal(v);
    } catch {
      // ignore
    }
  };

  const loadCreatorMarkets = useCallback(async () => {
    setManageError("");
    setManageStatus("");

    try {
      const eth = (ethereum as unknown as InjectedEthereum | null) ?? null;
      if (!eth) return;

      const addr = account || (await connect());
      if (!addr) return;
      const user = addr.toLowerCase();

      const provider = new ethers.BrowserProvider(eth as InjectedEthereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CREATOR_ABI, provider);

      const paused = await contract.globalPaused();
      setGlobalPausedState(Boolean(paused));

      const count = await contract.marketCount();
      const total = Number(count);

      const rows: CreatorMarket[] = [];
      for (let i = 0; i < total; i++) {
        const g = await contract.getMarket(i);
        const admin = await contract.getMarketAdmin(i);

        const creator = String(g.creator).toLowerCase();
        if (creator !== user) continue;

        rows.push({
          id: i,
          question: String(g.question),
          closeTime: BigInt(g.closeTime),
          status: Number(g.status),
          paused: Boolean(admin.paused),
          disputeUsed: Boolean(admin.disputeUsed),
          disputeActive: Boolean(admin.disputeActive),
        });
      }

      setCreatorMarkets(rows);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setManageError(err?.message || "Failed to load markets");
    }
  }, [account, connect, ethereum]);

  useEffect(() => {
    if (!isOwner) return;
    loadCreatorMarkets();
  }, [isOwner, loadCreatorMarkets]);

  const toggleGlobalPause = async (pause: boolean) => {
    setManageError("");
    setManageStatus(pause ? "Pausing all markets..." : "Unpausing all markets...");

    try {
      const eth = (ethereum as unknown as InjectedEthereum | null) ?? null;
      if (!eth) throw new Error("Wallet not connected");

      const provider = new ethers.BrowserProvider(eth as InjectedEthereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CREATOR_ABI, signer);
      const tx = await contract.setGlobalPause(pause);
      await tx.wait();
      setGlobalPausedState(pause);
      setManageStatus(pause ? "All markets paused" : "All markets unpaused");
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string | number };
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setManageError("Transaction rejected by user");
      } else {
        setManageError(err?.message || "Failed to set global pause");
      }
    } finally {
      setTimeout(() => setManageStatus(""), 1500);
    }
  };

  const toggleMarketPause = async (id: number, pause: boolean) => {
    setManageError("");
    setManageStatus(pause ? `Pausing market #${id}...` : `Unpausing market #${id}...`);

    try {
      const eth = (ethereum as unknown as InjectedEthereum | null) ?? null;
      if (!eth) throw new Error("Wallet not connected");

      const provider = new ethers.BrowserProvider(eth as InjectedEthereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CREATOR_ABI, signer);
      const tx = await contract.setMarketPause(id, pause);
      await tx.wait();
      await loadCreatorMarkets();
      setManageStatus(pause ? `Market #${id} paused` : `Market #${id} unpaused`);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string | number };
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setManageError("Transaction rejected by user");
      } else {
        setManageError(err?.message || "Failed to set market pause");
      }
    } finally {
      setTimeout(() => setManageStatus(""), 1500);
    }
  };

  const startEdit = (m: CreatorMarket) => {
    setEditingMarketId(m.id);
    setEditQuestion(m.question);
    setEditDescription("");
    setEditCategory("");
  };

  const submitEdit = async (id: number) => {
    setManageError("");
    setManageStatus(`Editing market #${id}...`);

    try {
      const eth = (ethereum as unknown as InjectedEthereum | null) ?? null;
      if (!eth) throw new Error("Wallet not connected");

      const provider = new ethers.BrowserProvider(eth as InjectedEthereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CREATOR_ABI, signer);
      const tx = await contract.editMarket(id, editQuestion, editDescription, editCategory);
      await tx.wait();
      setEditingMarketId(null);
      await loadCreatorMarkets();
      setManageStatus(`Market #${id} updated`);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string | number };
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setManageError("Transaction rejected by user");
      } else {
        setManageError(err?.message || "Failed to edit market");
      }
    } finally {
      setTimeout(() => setManageStatus(""), 1500);
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
      const eth = (ethereum as unknown as InjectedEthereum | null) ?? null;
      if (!eth) throw new Error('Wallet not connected');
      const provider = new ethers.BrowserProvider(eth as InjectedEthereum);
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
      let receipt: ethers.TransactionReceipt | null = null;
      try {
        while (Date.now() - start < timeoutMs) {
          receipt = await provider.getTransactionReceipt(tx.hash);
          if (receipt && receipt.blockNumber) break;
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (pollErr) {
        logger.error('Polling tx receipt error:', pollErr);
      }

      if (receipt && receipt.blockNumber) {
        setTxStatus('✅ Market created successfully!');
        setTimeout(() => router.push('/markets'), 1500);
      } else {
        // show user the pending status and link to explorer
        const explorerUrl = `https://explorer.testnet.blockdag.network/tx/${tx.hash}`;
        setTxStatus(`Transaction pending — view on explorer: ${explorerUrl}`);
      }
    } catch (err: unknown) {
      logger.error('Error creating market:', err);
      const e = err as { code?: string | number; message?: string };
      if (e.code === "ACTION_REJECTED" || e.code === 4001) {
        setError("Transaction rejected by user");
      } else if (e.message?.includes("only owner")) {
        setError("❌ Only the contract owner can create markets");
      } else {
        setError(e.message || "Failed to create market. Please try again.");
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
      <main className="min-h-screen flex items-center justify-center px-4 pt-1 pb-20 relative z-10">
        <div className="text-center">
          <p className="text-lg md:text-xl mp-text-muted">Verifying ownership...</p>
        </div>
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 pt-1 pb-20 relative z-10">
        <div className="text-center max-w-md w-full">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#C07070] mb-4">Access Denied</h1>
          <p className="text-base md:text-lg mp-text-muted mb-8">
            Only the contract owner can create markets.
          </p>
          <Link href="/" className="inline-block w-full md:w-auto px-8 py-3 md:py-4 bg-[#5B7C99] hover:bg-[#5B7C99]/80 text-white font-semibold rounded-lg transition-all">
            ← Back Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 pt-1 pb-20 relative z-10">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-3 md:mb-4">Create Market</h1>
          <p className="text-base md:text-lg mp-text-muted">
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

        <form
          onSubmit={handleSubmit}
          className="mp-panel p-6 sm:p-8 rounded-lg border border-[#5B7C99]/30 shadow-[0_0_20px_rgba(91,124,153,0.2)] space-y-6 sm:space-y-8"
          style={{ color: 'var(--mp-fg)' }}
        >

          {/* Market Type */}
          <div>
            <label className="block text-base md:text-lg mp-text-muted font-semibold mb-4">
              Market Type *
            </label>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setMarketType("manual")}
                className={`p-4 sm:p-6 rounded-lg border-2 transition-all ${marketType === "manual"
                  ? "border-[#5B7C99] bg-[#5B7C99]/10"
                  : "border-[color:var(--mp-border)] bg-[color:var(--mp-bg)] hover:border-[#5B7C99]/50"
                  }`}
              >
                <div className="font-semibold text-base md:text-lg mp-text-muted">Manual</div>
                <div className="text-xs md:text-sm mp-text-muted opacity-70 mt-2">You resolve</div>
              </button>
              <button
                type="button"
                onClick={() => setMarketType("oracle")}
                className={`p-4 sm:p-6 rounded-lg border-2 transition-all ${marketType === "oracle"
                  ? "border-[#5B7C99] bg-[#5B7C99]/10"
                  : "border-[color:var(--mp-border)] bg-[color:var(--mp-bg)] hover:border-[#5B7C99]/50"
                  }`}
              >
                <div className="font-semibold text-base md:text-lg mp-text-muted">Oracle</div>
                <div className="text-xs md:text-sm mp-text-muted opacity-70 mt-2">Auto-resolves</div>
              </button>
            </div>
          </div>

          {/* Question */}
          <div>
            <label className="block text-base md:text-lg mp-text-muted font-semibold mb-3">
              Market Question *
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., Will BTC exceed $100K by Dec 31, 2025?"
              maxLength={500}
              rows={4}
              className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[color:var(--mp-bg)] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[color:var(--mp-fg)] placeholder:text-[color:var(--mp-fg-muted)] placeholder:opacity-70 focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)] resize-none"
            />
            <div className="text-xs sm:text-sm mp-text-muted opacity-70 mt-3">
              {question.length}/500 characters
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-base md:text-lg mp-text-muted font-semibold mb-3">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details about resolution criteria..."
              rows={3}
              className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[color:var(--mp-bg)] border-2 border-[#5B7C99]/50 rounded-lg text-base md:text-lg text-[color:var(--mp-fg)] placeholder:text-[color:var(--mp-fg-muted)] placeholder:opacity-70 focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)] resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-base md:text-lg mp-text-muted font-semibold mb-3">
              Category *
            </label>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(cat)}
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

          {/* Timezone Selection */}
          <div>
            <label className="block text-base md:text-lg mp-text-muted font-semibold mb-3">
              Timezone *
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[color:var(--mp-bg)] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[color:var(--mp-fg)] focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)]"
            >
              {TIMEZONE_OPTIONS.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <div className="text-xs sm:text-sm mp-text-muted opacity-70 mt-2">
              Select your timezone - the closing time will be calculated relative to this zone
            </div>
          </div>

          {/* Closing Date/Time */}
          <div>
            <label className="block text-base md:text-lg mp-text-muted font-semibold mb-3">
              Closing Date & Time *
            </label>
            <input
              type="datetime-local"
              value={closeDateLocal}
              onChange={(e) => setCloseDateLocal(e.target.value)}
              required
              className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[color:var(--mp-bg)] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[color:var(--mp-fg)] focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)]"
            />
            {closeDateLocal && (
              <div className="text-xs sm:text-sm mp-text-muted opacity-80 mt-3">
                Closes in {timezone}: {new Date(closeDateLocal).toLocaleString()}
              </div>
            )}
          </div>

          {/* Oracle Fields */}
          {marketType === "oracle" && (
            <>
              <div>
                <label className="block text-base md:text-lg mp-text-muted font-semibold mb-3">
                  Price Feed *
                </label>
                <select
                  value={priceSymbol}
                  onChange={(e) => setPriceSymbol(e.target.value)}
                  required
                  className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[color:var(--mp-bg)] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[color:var(--mp-fg)] focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)]"
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
                <label className="block text-base md:text-lg mp-text-muted font-semibold mb-3">
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
                  className="w-full px-4 sm:px-5 py-3 sm:py-4 bg-[color:var(--mp-bg)] border-2 border-[#5B7C99] rounded-lg text-base md:text-lg text-[color:var(--mp-fg)] placeholder:text-[color:var(--mp-fg-muted)] placeholder:opacity-70 focus:outline-none focus:shadow-[0_0_15px_rgba(91,124,153,0.4)]"
                />
                {targetPrice && (
                  <div className="text-xs sm:text-sm mp-text-muted opacity-80 mt-3">
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
            className="w-full py-4 sm:py-5 text-base md:text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg bg-[#5B7C99] hover:bg-[#5B7C99]/80 text-white transition-all"
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

        {/* Draft Queue (bot suggestions) */}
        <div className="mt-10 mp-panel p-6 sm:p-8 rounded-lg border border-[#5B7C99]/30 shadow-[0_0_20px_rgba(91,124,153,0.2)]" style={{ color: 'var(--mp-fg)' }}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl md:text-2xl font-bold">Draft Queue</h2>
              <p className="text-sm md:text-base mp-text-muted mt-1">Review suggested markets and load them into the form.</p>
            </div>
            <button
              type="button"
              onClick={() => loadDrafts()}
              className="px-4 py-2 rounded-lg bg-[color:var(--mp-bg)] border-2 border-[#5B7C99]/50 text-[color:var(--mp-fg)] hover:border-[#5B7C99] transition-all"
            >
              Refresh
            </button>
          </div>

          {draftsError && (
            <div className="mt-5 p-4 rounded-lg border border-[#C07070] bg-[#C07070]/15 text-[#C07070] text-center font-semibold text-sm md:text-base">
              {draftsError}
            </div>
          )}
          {draftsStatus && (
            <div className="mt-5 p-4 rounded-lg border border-[#5B7C99] bg-[#5B7C99]/15 text-[#5B7C99] text-center font-semibold text-sm md:text-base">
              {draftsStatus}
            </div>
          )}

          <div className="mt-6 space-y-4">
            {draftsLoading ? (
              <div className="text-center mp-text-muted">Loading drafts...</div>
            ) : drafts.length === 0 ? (
              <div className="text-center mp-text-muted">No pending drafts.</div>
            ) : (
              drafts.map((d) => (
                <div key={d.id} className="p-4 rounded-lg border border-[#5B7C99]/30 bg-[color:var(--mp-bg)]">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-55">
                      <div className="font-bold">Draft #{d.id}</div>
                      <div className="mp-text-muted mt-1 wrap-break-word">{d.question}</div>
                      <div className="text-xs mp-text-muted opacity-80 mt-2">
                        Category: {d.category} · Closes: {new Date(d.closeTimeIso).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => loadDraftIntoForm(d)}
                        className="px-4 py-2 rounded-lg bg-[#5B7C99] hover:bg-[#5B7C99]/80 text-white font-semibold"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftStatus('approve', d.id)}
                        className="px-4 py-2 rounded-lg bg-[color:var(--mp-bg)] border-2 border-[#5B7C99]/50 text-[color:var(--mp-fg)] hover:border-[#5B7C99] transition-all"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftStatus('reject', d.id)}
                        className="px-4 py-2 rounded-lg bg-[color:var(--mp-bg)] border-2 border-[#C07070]/60 text-[#C07070] hover:border-[#C07070] transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 text-xs mp-text-muted opacity-80">
            Bot ingestion uses `POST /api/drafts` with `x-draft-bot-token` (env: `DRAFT_BOT_TOKEN`).
          </div>
        </div>

        {/* Creator/Admin Controls (restricted to this page for safety) */}
        <div className="mt-10 mp-panel p-6 sm:p-8 rounded-lg border border-[#5B7C99]/30 shadow-[0_0_20px_rgba(91,124,153,0.2)]" style={{ color: 'var(--mp-fg)' }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold">Manage Markets</h2>
              <p className="text-sm md:text-base mp-text-muted mt-1">
                Pause/edit your markets and handle emergencies.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadCreatorMarkets()}
              className="px-4 py-2 rounded-lg bg-[color:var(--mp-bg)] border-2 border-[#5B7C99]/50 text-[color:var(--mp-fg)] hover:border-[#5B7C99] transition-all"
            >
              Refresh
            </button>
          </div>

          {manageError && (
            <div className="mt-5 p-4 rounded-lg border border-[#C07070] bg-[#C07070]/15 text-[#C07070] text-center font-semibold text-sm md:text-base">
              {manageError}
            </div>
          )}
          {manageStatus && (
            <div className="mt-5 p-4 rounded-lg border border-[#5B7C99] bg-[#5B7C99]/15 text-[#5B7C99] text-center font-semibold text-sm md:text-base">
              {manageStatus}
            </div>
          )}

          {/* Emergency Global Pause (owner only) */}
          {isContractOwner && (
            <div className="mt-6 p-4 rounded-lg border border-[#D4A574]/40 bg-[#D4A574]/10">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-bold">Emergency: Global Pause</div>
                  <div className="text-sm mp-text-muted mt-1">Stops all markets immediately.</div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={globalPausedState}
                    onClick={() => toggleGlobalPause(true)}
                    className="px-4 py-2 rounded-lg bg-[#C07070] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Pause All
                  </button>
                  <button
                    type="button"
                    disabled={!globalPausedState}
                    onClick={() => toggleGlobalPause(false)}
                    className="px-4 py-2 rounded-lg bg-[#5B7C99] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Unpause
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Per-market controls */}
          <div className="mt-6 space-y-4">
            {creatorMarkets.length === 0 ? (
              <div className="text-center mp-text-muted">No markets found for this address.</div>
            ) : (
              creatorMarkets.map((m) => (
                <div key={m.id} className="p-4 rounded-lg border border-[#5B7C99]/30 bg-[color:var(--mp-bg)]">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-55">
                      <div className="font-bold">#{m.id}</div>
                      <div className="mp-text-muted mt-1 wrap-break-word">{m.question}</div>
                      <div className="text-xs mp-text-muted opacity-80 mt-2">
                        Status: {m.status} · Paused: {String(m.paused)} · Dispute used: {String(m.disputeUsed)}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMarketPause(m.id, !m.paused)}
                        className="px-4 py-2 rounded-lg bg-[#5B7C99] hover:bg-[#5B7C99]/80 text-white font-semibold"
                      >
                        {m.paused ? "Unpause" : "Pause"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="px-4 py-2 rounded-lg bg-[color:var(--mp-bg)] border-2 border-[#5B7C99]/50 text-[color:var(--mp-fg)] hover:border-[#5B7C99] transition-all"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {editingMarketId === m.id && (
                    <div className="mt-4 grid grid-cols-1 gap-3">
                      <input
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        placeholder="New question (required if changing)"
                        className="w-full px-4 py-3 bg-[color:var(--mp-bg)] border-2 border-[#5B7C99]/50 rounded-lg text-[color:var(--mp-fg)] placeholder:text-[color:var(--mp-fg-muted)] placeholder:opacity-70 focus:outline-none"
                      />
                      <input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="New description (optional)"
                        className="w-full px-4 py-3 bg-[color:var(--mp-bg)] border-2 border-[#5B7C99]/50 rounded-lg text-[color:var(--mp-fg)] placeholder:text-[color:var(--mp-fg-muted)] placeholder:opacity-70 focus:outline-none"
                      />
                      <input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        placeholder="New category (optional)"
                        className="w-full px-4 py-3 bg-[color:var(--mp-bg)] border-2 border-[#5B7C99]/50 rounded-lg text-[color:var(--mp-fg)] placeholder:text-[color:var(--mp-fg-muted)] placeholder:opacity-70 focus:outline-none"
                      />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => submitEdit(m.id)}
                          className="px-4 py-2 rounded-lg bg-[#5B7C99] hover:bg-[#5B7C99]/80 text-white font-semibold"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMarketId(null)}
                          className="px-4 py-2 rounded-lg bg-[color:var(--mp-bg)] border-2 border-[#5B7C99]/50 text-[color:var(--mp-fg)] hover:border-[#5B7C99] transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="text-xs mp-text-muted opacity-80">
                        Note: edits are only allowed if no bets exist.
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center pt-4">
          <Link href="/markets" className="text-base md:text-lg text-[#5B7C99] hover:text-[color:var(--mp-fg-muted)] transition-colors">
            ← Back to Markets
          </Link>
        </div>
      </div >
    </main >
  );
}