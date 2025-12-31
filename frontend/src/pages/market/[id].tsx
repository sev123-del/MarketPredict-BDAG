"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Link from 'next/link';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../configs/contractConfig";
import { useUserSettings } from "../../hooks/useUserSettings";

const NEXT_PUBLIC_READ_RPC = (process.env.NEXT_PUBLIC_READ_RPC || "").trim();

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
  const { settings } = useUserSettings();
  // Prefer the router query id, but fall back to parsing the pathname for cases
  // where the page was served as a static-export and `router.query` is empty.
  const rawIdFromRouter = (() => {
    const r = router.query?.id;
    if (Array.isArray(r)) return r[0];
    if (typeof r === 'string') return r;
    return undefined;
  })();
  const fallbackIdFromPath = typeof window !== 'undefined' ? (() => {
    try {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      return last ?? undefined;
    } catch (e) {
      return undefined;
    }
  })() : undefined;
  const id = (rawIdFromRouter ?? fallbackIdFromPath) as string | undefined;
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState<"yes" | "no" | null>(null);
  const displayTimezone = settings.timezone && settings.timezone !== 'system'
    ? settings.timezone
    : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [successMessage, setSuccessMessage] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [flashWarning, setFlashWarning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fatalMarketLoadRef = useRef(false);
  const [potentialWinnings, setPotentialWinnings] = useState("0");
  const [userAddress, setUserAddress] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [marketCreator, setMarketCreator] = useState<string>("");
  const [managingMarket, setManagingMarket] = useState(false);
  const [oppositePoolEmpty, setOppositePoolEmpty] = useState(false);

  const [mpBalance, setMpBalance] = useState("0");
  const [mpBalanceLoading, setMpBalanceLoading] = useState(false);

  // Disputes (single dispute per market; bond required)
  const DISPUTE_ABI = [
    "function globalPaused() view returns (bool)",
    "function disputeBondWei() view returns (uint256)",
    "function getMarketAdmin(uint256 id) view returns (address creator, bool paused, bool disputeUsed, bool disputeActive, address disputeOpener, uint256 disputeBond)",
    "function getUserPosition(uint256 id, address user) view returns (uint256 yesAmount, uint256 noAmount, bool claimed)",
    "function openDispute(uint256 id, string reason)",
  ];

  const [disputeReason, setDisputeReason] = useState("");
  const [disputeBondEth, setDisputeBondEth] = useState("0");
  const [disputeUsed, setDisputeUsed] = useState(false);
  const [disputeActive, setDisputeActive] = useState(false);
  const [canDispute, setCanDispute] = useState(false);
  const [openingDispute, setOpeningDispute] = useState(false);
  const [disputeMessage, setDisputeMessage] = useState("");

  const DISPUTE_WINDOW_SECONDS = 2 * 60 * 60;

  // Typed RPC request and injected provider helper types (avoid `any`)
  type JsonRpcRequest = { method: string; params?: unknown[] | Record<string, unknown> };
  type InjectedProvider = {
    request: (request: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
    on?: (evt: string, cb: (...args: unknown[]) => void) => void;
    removeListener?: (evt: string, cb: (...args: unknown[]) => void) => void;
  };

  // Normalize thrown errors to a predictable shape for logging and UX
  const extractErrorInfo = (err: unknown) => {
    // Default fallback
    const result: { message: string; code?: string | number; reason?: string } = { message: String(err ?? 'Unknown error') };

    if (err instanceof Error) {
      result.message = err.message || String(err);
      return result;
    }

    if (typeof err === 'object' && err !== null) {
      try {
        const asRec = err as Record<string, unknown>;
        if (typeof asRec.message === 'string') result.message = asRec.message;
        if (typeof asRec.reason === 'string') result.reason = asRec.reason;
        if (asRec.code !== undefined) result.code = asRec.code as string | number;
      } catch {
        // ignore
      }
    }

    return result;
  };

  // Small helper to safely read injected ethereum provider
  const getInjectedEthereum = useCallback((): InjectedProvider | null => {
    const win: unknown = typeof window !== 'undefined' ? window : undefined;
    if (!win) return null;
    const maybe = (win as Window & { ethereum?: unknown }).ethereum;
    if (!maybe || typeof (maybe as InjectedProvider).request !== 'function') return null;
    return maybe as InjectedProvider;
  }, []);

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
      timeZone: displayTimezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    };

    return date.toLocaleString('en-US', options);
  };


  const checkOwnership = useCallback(async () => {
    const eth = getInjectedEthereum();
    if (!eth || typeof eth.request !== 'function') {
      setUserAddress("");
      setIsOwner(false);
      return;
    }

    try {
      // Non-intrusive check for connected accounts (does not prompt the wallet)
      const accountsRaw = await (eth.request as (req: JsonRpcRequest) => Promise<unknown>)({ method: 'eth_accounts' });
      const accounts = Array.isArray(accountsRaw) ? accountsRaw.map((a) => String(a)) : [];
      if (accounts.length > 0) {
        const address = String(accounts[0]).toLowerCase();
        setUserAddress(address);
        setIsOwner(address === OWNER_ADDRESS);
      } else {
        setUserAddress("");
        setIsOwner(false);
      }
    } catch (err: unknown) {
      const info = extractErrorInfo(err);
      console.error("Error checking ownership:", info.message);
      setUserAddress("");
      setIsOwner(false);
    }
  }, [getInjectedEthereum]);

  const loadMpBalance = useCallback(async (): Promise<string> => {
    if (!userAddress || !ethers.isAddress(userAddress)) {
      setMpBalance('0');
      return '0';
    }

    setMpBalanceLoading(true);
    try {
      const rpcProvider = NEXT_PUBLIC_READ_RPC ? new ethers.JsonRpcProvider(NEXT_PUBLIC_READ_RPC) : null;
      const eth = getInjectedEthereum();
      const browserProvider = eth ? new ethers.BrowserProvider(eth as InjectedProvider) : null;

      const contractRead = rpcProvider ? new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rpcProvider) : null;
      const contractBrowser = browserProvider ? new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, browserProvider) : null;

      let bal: bigint = BigInt(0);
      if (contractRead) {
        try {
          bal = await contractRead.getBalance(userAddress);
        } catch {
          try {
            bal = await contractRead.balances(userAddress);
          } catch {
            if (contractBrowser) {
              try {
                bal = await contractBrowser.getBalance(userAddress);
              } catch {
                bal = BigInt(0);
              }
            } else {
              bal = BigInt(0);
            }
          }
        }
      } else if (contractBrowser) {
        try {
          bal = await contractBrowser.getBalance(userAddress);
        } catch {
          bal = BigInt(0);
        }
      }

      const formatted = ethers.formatEther(bal || BigInt(0));
      setMpBalance(formatted);
      return formatted;
    } catch {
      setMpBalance('0');
      return '0';
    } finally {
      setMpBalanceLoading(false);
    }
  }, [getInjectedEthereum, userAddress]);

  const loadMarket = useCallback(async (): Promise<boolean> => {
    try {
      // Use server-side API to fetch market data (server will use private RPC)
      const marketId = Number(Array.isArray(id) ? id[0] : (id ?? '0'));
      if (!Number.isFinite(marketId) || !Number.isInteger(marketId) || marketId < 0) {
        fatalMarketLoadRef.current = true;
        setMarket(null);
        setErrorMessage('Invalid market id');
        return false;
      }

      const res = await fetch(`/api/market/${marketId}`);
      if (!res.ok) {
        let serverMsg = '';
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const body = await res.json();
            if (body && typeof body === 'object') {
              const rec = body as Record<string, unknown>;
              if (typeof rec.error === 'string') serverMsg = rec.error;
              else if (typeof rec.message === 'string') serverMsg = rec.message;
            }
          } else {
            serverMsg = await res.text();
          }
        } catch {
          // ignore
        }

        const fatal = res.status === 400 || res.status === 404;
        if (fatal) {
          fatalMarketLoadRef.current = true;
        }

        const msg = serverMsg || (fatal ? 'Market not found' : 'Failed to load market');
        setMarket(null);
        setErrorMessage(msg);
        return false;
      }
      const m = await res.json();

      // Successful fetch: clear any previous fatal state
      fatalMarketLoadRef.current = false;
      setErrorMessage('');
      setMarket({
        question: m.question,
        yesPool: BigInt(m.yesPool || 0),
        noPool: BigInt(m.noPool || 0),
        resolved: m.status === 1,
        outcomeYes: Boolean(m.outcome),
        closeTime: BigInt(m.closeTime || 0),
      });
      return true;
    } catch (err) {
      const info = extractErrorInfo(err);
      console.error("Error loading market:", info.message);
      setErrorMessage(info.message || 'Failed to load market');
      return false;
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadDisputeState = useCallback(async (): Promise<boolean> => {
    try {
      if (!id) return true;
      const eth = getInjectedEthereum();
      if (!eth) {
        setCanDispute(false);
        return true;
      }

      const marketId = Number(Array.isArray(id) ? id[0] : (id ?? '0'));
      const provider = new ethers.BrowserProvider(eth);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, DISPUTE_ABI, provider);

      const pausedGlobal = await contract.globalPaused();
      if (pausedGlobal) {
        setCanDispute(false);
        return true;
      }

      const bondWei = await contract.disputeBondWei();
      setDisputeBondEth(ethers.formatEther(bondWei));

      const admin = await contract.getMarketAdmin(marketId);
      try {
        const creatorLower = String(admin.creator || '').toLowerCase();
        setMarketCreator(creatorLower);
      } catch {
        setMarketCreator('');
      }
      setDisputeUsed(Boolean(admin.disputeUsed));
      setDisputeActive(Boolean(admin.disputeActive));

      if (!userAddress) {
        setCanDispute(false);
        return true;
      }

      const pos = await contract.getUserPosition(marketId, userAddress);
      const toBigint = (v: unknown): bigint => (typeof v === 'bigint' ? v : BigInt(String(v)));
      const yesAmount = toBigint(pos.yesAmount);
      const noAmount = toBigint(pos.noAmount);
      const hasPosition = yesAmount > BigInt(0) || noAmount > BigInt(0);

      const closeTime = market?.closeTime ?? BigInt(0);
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      const ended = closeTime > BigInt(0) && nowSec >= closeTime;
      const withinWindow = closeTime > BigInt(0) && nowSec <= (closeTime + BigInt(DISPUTE_WINDOW_SECONDS));

      // Contract allows dispute only after endTime and before resolution.
      const unresolved = market ? !market.resolved : false;
      const eligible = hasPosition && ended && withinWindow && unresolved && !Boolean(admin.disputeUsed);
      setCanDispute(eligible);

      if (ended && !withinWindow && unresolved && !Boolean(admin.disputeUsed)) {
        setDisputeMessage("Dispute window has closed (2 hours after market close).");
      }
      return true;
    } catch (err: unknown) {
      // Non-fatal; just hide dispute UI if we cannot determine eligibility.
      setCanDispute(false);
      return false;
    }
  }, [id, getInjectedEthereum, market, userAddress]);

  const canEditMarket = Boolean(userAddress) && (isOwner || (marketCreator && userAddress === marketCreator));
  const canCancelMarket = Boolean(userAddress) && isOwner;

  const handleEditMarket = useCallback(async () => {
    if (!id) return;
    if (!canEditMarket) {
      setErrorMessage("You don't have permission to edit this market.");
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    const marketId = Number(Array.isArray(id) ? id[0] : (id ?? '0'));
    if (!Number.isFinite(marketId) || !Number.isInteger(marketId) || marketId < 0) {
      setErrorMessage('Invalid market id');
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    const newQuestion = window.prompt('Edit question (leave empty to keep current):', market?.question || '') ?? null;
    if (newQuestion === null) return;
    const newDescription = window.prompt('Edit description (optional):', '') ?? null;
    if (newDescription === null) return;
    const newCategory = window.prompt('Edit category (optional):', '') ?? null;
    if (newCategory === null) return;

    const eth = getInjectedEthereum();
    if (!eth) {
      setErrorMessage('Wallet not connected');
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    setManagingMarket(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.editMarket(marketId, newQuestion, newDescription, newCategory);
      await tx.wait();
      setSuccessMessage(`Market #${marketId} updated.`);
      setTimeout(() => setSuccessMessage(""), 5000);
      await loadMarket();
    } catch (e: unknown) {
      const info = extractErrorInfo(e);
      const msg = info.code === 'ACTION_REJECTED' || info.code === 4001 ? 'Transaction rejected by user' : (info.reason || info.message || 'Failed to edit market');
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(""), 7000);
    } finally {
      setManagingMarket(false);
    }
  }, [id, canEditMarket, getInjectedEthereum, loadMarket, market?.question, isOwner, marketCreator, userAddress]);

  const handleCancelMarket = useCallback(async () => {
    if (!id) return;
    if (!canCancelMarket) {
      setErrorMessage("Only the contract owner can cancel a market.");
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    const marketId = Number(Array.isArray(id) ? id[0] : (id ?? '0'));
    if (!Number.isFinite(marketId) || !Number.isInteger(marketId) || marketId < 0) {
      setErrorMessage('Invalid market id');
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    const ok = window.confirm(
      `Cancel (delete) market #${marketId}?\n\nThis marks it CANCELLED on-chain. If anyone already placed bets, they can claim a refund.`
    );
    if (!ok) return;

    const eth = getInjectedEthereum();
    if (!eth) {
      setErrorMessage('Wallet not connected');
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    setManagingMarket(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.cancelMarket(marketId);
      await tx.wait();
      setSuccessMessage(`Market #${marketId} cancelled.`);
      setTimeout(() => setSuccessMessage(""), 5000);
      await loadMarket();
    } catch (e: unknown) {
      const info = extractErrorInfo(e);
      const msg = info.code === 'ACTION_REJECTED' || info.code === 4001 ? 'Transaction rejected by user' : (info.reason || info.message || 'Failed to cancel market');
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(""), 7000);
    } finally {
      setManagingMarket(false);
    }
  }, [id, canCancelMarket, getInjectedEthereum, loadMarket]);

  useEffect(() => {
    if (id) loadMarket();
    checkOwnership();
  }, [id, loadMarket, checkOwnership]);

  useEffect(() => {
    void loadMpBalance();
  }, [loadMpBalance]);

  useEffect(() => {
    const onRefresh = () => {
      void loadMpBalance();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('mp:refresh-balances', onRefresh as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mp:refresh-balances', onRefresh as EventListener);
      }
    };
  }, [loadMpBalance]);

  useEffect(() => {
    if (!id) return;
    loadDisputeState();
  }, [id, market, userAddress, loadDisputeState]);

  // Keep market/dispute state up-to-date without hammering RPC:
  // - pauses when tab is hidden
  // - backs off when refresh fails
  useEffect(() => {
    if (!id) return;

    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let nextDelayMs = 10_000;

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

      // Stop polling if the server says the market doesn't exist / is invalid.
      if (fatalMarketLoadRef.current) return;

      // If the tab is hidden, avoid background polling.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        schedule(30_000);
        return;
      }

      const okMarket = await loadMarket();
      if (fatalMarketLoadRef.current) return;
      const okDispute = await loadDisputeState();

      if (okMarket && okDispute) {
        nextDelayMs = 10_000;
      } else {
        nextDelayMs = Math.min(nextDelayMs * 2, 60_000);
      }

      schedule(nextDelayMs);
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        nextDelayMs = 10_000;
        schedule(0);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    schedule(0);

    return () => {
      disposed = true;
      clearTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [id, loadMarket, loadDisputeState]);

  const handleOpenDispute = async () => {
    if (!id) return;
    setDisputeMessage("");
    setErrorMessage("");

    const reason = disputeReason.trim();
    if (reason.length < 5) {
      setDisputeMessage("Please enter a short reason (min 5 chars).");
      return;
    }

    const eth = getInjectedEthereum();
    if (!eth) {
      setDisputeMessage("Wallet not connected.");
      return;
    }

    setOpeningDispute(true);
    try {
      const marketId = Number(Array.isArray(id) ? id[0] : (id ?? '0'));
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, DISPUTE_ABI, signer);
      const tx = await contract.openDispute(marketId, reason);
      setDisputeMessage(`Dispute submitted: ${tx.hash}`);
      await tx.wait();
      setDisputeMessage("Dispute opened. Market is temporarily frozen.");
      setDisputeReason("");
      await loadMarket();
      await loadDisputeState();
    } catch (err: unknown) {
      const info = extractErrorInfo(err);
      if (info.code === "ACTION_REJECTED" || info.code === 4001) {
        setDisputeMessage("Transaction rejected by user.");
      } else {
        setDisputeMessage(info.message || "Failed to open dispute.");
      }
    } finally {
      setOpeningDispute(false);
    }
  };

  const handlePredict = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setErrorMessage("Please enter a crypto value greater than 0, then try again.");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    const eth = getInjectedEthereum();
    if (!eth) {
      setErrorMessage("Please connect your wallet!");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    try {
      setPredicting(true);

      const provider = new ethers.BrowserProvider(eth as InjectedProvider);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const marketId = Number(Array.isArray(id) ? id[0] : (id ?? '0'));
      const amountWei = ethers.parseEther(amount);
      const tx = await contract.predict(marketId, side === "yes" ? 1 : 0, amountWei);
      await tx.wait();

      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mp:refresh-balances'));
        }
      } catch {
        // ignore
      }

      setSuccessMessage(`Prediction placed: ${side?.toUpperCase() || 'UNKNOWN'} for ${amount} BDAG`);
      setTimeout(() => setSuccessMessage(""), 5000);
      setAmount("");
      await loadMarket();
    } catch (err: unknown) {
      const info = extractErrorInfo(err);
      console.error("Error placing prediction:", info.message);

      const errorCode = info.code;
      const errorReason = info.reason;
      const errorMessage = String(info.message || "");

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
        const errorString = JSON.stringify(info).toLowerCase();
        if (errorString.includes("insufficient") ||
          (errorReason && errorReason.toLowerCase().includes("insufficient")) ||
          (errorMessage && errorMessage.toLowerCase().includes("insufficient"))) {
          userMessage = "❌ Insufficient balance! Please deposit more crypto to your MarketPredict account.";
        } else if (errorReason) {
          userMessage = errorReason.split("\n")[0]; // Take first line only
        } else if (errorMessage) {
          userMessage = errorMessage.split("\n")[0]; // Take first line only
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

    const eth = getInjectedEthereum();
    if (!eth) {
      setErrorMessage("Please connect your wallet!");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    try {
      setClaiming(true);

      const provider = new ethers.BrowserProvider(eth as InjectedProvider);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const marketId = Number(Array.isArray(id) ? id[0] : (id ?? '0'));
      const tx = await contract.claim(marketId);
      await tx.wait();

      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mp:refresh-balances'));
        }
      } catch {
        // ignore
      }

      setSuccessMessage("✅ Winnings claimed successfully!");
      setTimeout(() => setSuccessMessage(""), 5000);
      await loadMarket();
    } catch (err: unknown) {
      const info = extractErrorInfo(err);
      console.error("Error claiming winnings:", info.message);

      let userMessage = "Failed to claim winnings";
      const errorString = String(JSON.stringify(info)).toLowerCase();
      if (errorString.includes("already claimed")) {
        userMessage = "You\'ve already claimed your winnings from this market";
      } else if (errorString.includes("not resolved")) {
        userMessage = "Market must be resolved before claiming";
      } else if (info.message && info.message.includes("user rejected")) {
        userMessage = "Transaction cancelled by user";
      } else if (info.reason) {
        userMessage = info.reason;
      } else if (info.message) {
        userMessage = info.message;
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
      <main className="min-h-screen flex items-center justify-center relative z-10">
        <p className="text-xl text-[#00C4BA]">Loading market...</p>
      </main>
    );
  }

  if (!market) {
    return (
      <main className="min-h-screen flex items-center justify-center relative z-10">
        <div className="text-center">
          <p className="text-xl text-red-400 mb-4">Market not found</p>
          <Link href="/markets" className="text-[#00C4BA] hover:text-[#00968E]">← Back to Markets</Link>
        </div>
      </main>
    );
  }

  const isExpired = Number(market.closeTime) * 1000 < Date.now();

  return (
    <main className="min-h-screen px-4 pt-1 pb-20 relative z-10">
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

          {/* Creator controls */}
          {(canEditMarket || canCancelMarket) && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleEditMarket}
                disabled={!canEditMarket || managingMarket}
                className={`px-4 py-2 bg-[#0072FF]/20 border-2 border-[#0072FF] text-[#0072FF] rounded-lg font-semibold hover:bg-[#0072FF]/30 transition-all text-sm ${(!canEditMarket || managingMarket) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                ✏️ Edit
              </button>
              {canCancelMarket && (
                <button
                  onClick={handleCancelMarket}
                  disabled={managingMarket}
                  className={`px-4 py-2 bg-red-500/20 border-2 border-red-500 text-red-400 rounded-lg font-semibold hover:bg-red-500/30 transition-all text-sm ${managingMarket ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  🗑️ Delete
                </button>
              )}
            </div>
          )}
        </div>

        <div
          className="p-8 rounded-lg border border-[#00C4BA]/30 shadow-[0_0_30px_rgba(0,196,186,0.3)] mb-8"
          style={{ background: 'var(--mp-surface-2)' }}
        >
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-4" style={{ color: 'var(--mp-fg)' }}>{market.question}</h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {(market.resolved || isExpired) && (
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
                      : {
                        backgroundColor: 'rgba(249, 115, 22, 0.2)',
                        color: '#fb923c',
                        border: '2px solid rgba(249, 115, 22, 0.5)'
                      })
                  }}>
                    {market.resolved ? "✓ Resolved" : "⏰ Expired"}
                  </span>
                )}
              </div>

              <div />
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
              <div className="p-4 rounded-lg border border-green-500/50" style={{ backgroundColor: 'var(--mp-bg)' }}>
                <p className="text-sm mp-text-muted mb-1">YES Pool</p>
                <p className="text-2xl font-bold text-green-400">
                  {ethers.formatEther(market.yesPool)} BDAG
                </p>
                <p className="text-sm mp-text-muted mt-1">{yesPercentage.toFixed(1)}%</p>
              </div>
              <div className="p-4 rounded-lg border border-red-500/50" style={{ backgroundColor: 'var(--mp-bg)' }}>
                <p className="text-sm mp-text-muted mb-1">NO Pool</p>
                <p className="text-2xl font-bold text-red-400">
                  {ethers.formatEther(market.noPool)} BDAG
                </p>
                <p className="text-sm mp-text-muted mt-1">{noPercentage.toFixed(1)}%</p>
              </div>
            </div>

            {/* Visual Progress Bar with Live Odds */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2 font-bold" style={{ fontSize: '1.125rem', lineHeight: 1.2 }}>
                <span style={{ color: '#00FFA3' }}>YES Odds: {yesOdds}x</span>
                <span style={{ color: '#ef4444' }}>NO Odds: {noOdds}x</span>
              </div>
              <div
                className="h-6 rounded-full overflow-hidden flex relative"
                style={{
                  backgroundColor: 'var(--mp-bg)',
                  boxShadow: '0 0 20px rgba(0,196,186,0.3) inset'
                }}
              >
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

                {(() => {
                  const boundary = Math.max(0, Math.min(100, Number(yesPercentage) || 0));
                  const blendHalf = 1.5; // percent on each side of boundary
                  const blendStart = Math.max(0, Math.min(100, boundary - blendHalf));
                  const blendEnd = Math.max(0, Math.min(100, boundary + blendHalf));
                  const blendWidth = Math.max(0, blendEnd - blendStart);
                  if (!(blendWidth > 0 && blendWidth < 100)) return null;
                  return (
                    <div
                      aria-hidden="true"
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{
                        left: `${blendStart}%`,
                        width: `${blendWidth}%`,
                        background: 'linear-gradient(90deg, rgba(0,196,186,0.95) 0%, rgba(239,68,68,0.95) 100%)',
                      }}
                    />
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Dispute (single per market; bond required) */}
          {(disputeActive || canDispute || disputeUsed || disputeMessage) && (
            <div className="mb-8 p-5 rounded-lg border border-orange-500/40 bg-orange-500/10">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-bold" style={{ color: 'var(--mp-fg)' }}>Dispute Market</div>
                  <div className="text-sm mp-text-muted mt-1">
                    One dispute per market. Bond: <strong>{disputeBondEth}</strong> BDAG (from your in-app balance).
                  </div>
                </div>
                {disputeActive && (
                  <div className="text-orange-300 font-semibold">⛔ Dispute active — market frozen</div>
                )}
              </div>

              {disputeMessage && (
                <div className="mt-4 text-sm text-orange-200">{disputeMessage}</div>
              )}

              {canDispute && !disputeActive && (
                <div className="mt-4">
                  <label className="block font-semibold mb-2" style={{ color: 'var(--mp-fg)' }}>Reason</label>
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    rows={3}
                    placeholder="Explain why this market needs review..."
                    className="w-full px-4 py-3 border-2 border-orange-500/40 rounded-lg focus:outline-none focus:border-orange-500 placeholder:text-[color:var(--mp-fg-muted)]"
                    style={{ backgroundColor: 'var(--mp-bg)', color: 'var(--mp-fg)' }}
                  />

                  <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs mp-text-muted">
                      Submitting a dispute freezes the market until reviewed.
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenDispute}
                      disabled={openingDispute}
                      className="px-5 py-2 rounded-lg bg-orange-500/20 border-2 border-orange-500 text-orange-200 font-bold hover:bg-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {openingDispute ? "Submitting..." : "Open Dispute"}
                    </button>
                  </div>
                </div>
              )}

              {!canDispute && disputeUsed && !disputeActive && (
                <div className="mt-4 text-sm mp-text-muted">A dispute has already been used for this market.</div>
              )}
            </div>
          )}

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
                    backgroundColor: side === "yes" ? '#00FFA3' : 'var(--mp-bg)',
                    color: side === "yes" ? '#0B0C10' : 'var(--mp-fg)',
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
                    backgroundColor: side === "no" ? '#ef4444' : 'var(--mp-bg)',
                    color: side === "no" ? '#ffffff' : 'var(--mp-fg)',
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
                      <div className="text-sm mp-text-muted mb-1">💰 Full refund if no one picks other side. Winnings grow as opposite pool grows.</div>
                      <div className="text-4xl font-bold mb-2" style={{
                        color: side === "yes" ? '#00FFA3' : '#ef4444',
                        textShadow: `0 0 20px ${side === "yes" ? 'rgba(0,255,163,0.8)' : 'rgba(239,68,68,0.8)'}`
                      }}>
                        {Number(potentialWinnings).toFixed(4)} BDAG
                      </div>
                      <div className="text-xs mp-text-muted">
                        Set the Trend - Be First to Predict!
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm mp-text-muted mb-1">💰 You&apos;ll Take Home If You Win ({Number(potentialWinnings).toFixed(4)} estimate) BDAG as of right now. Winnings fluctuate as pools grow.</div>
                      <div className="text-4xl font-bold mb-2" style={{
                        color: side === "yes" ? '#00FFA3' : '#ef4444',
                        textShadow: `0 0 20px ${side === "yes" ? 'rgba(0,255,163,0.8)' : 'rgba(239,68,68,0.8)'}`
                      }}>
                        {Number(potentialWinnings).toFixed(4)} BDAG
                      </div>
                      <div className="text-xs mp-text-muted">
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
                <label htmlFor="predict-amount" className="block mb-4 font-bold" style={{ fontSize: '1.5rem', color: 'var(--mp-fg)' }}>Amount to Predict</label>

                {/* Quick Amount Buttons */}
                <div className="mb-4" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {(
                    [
                      { label: '1', value: '1' },
                      { label: '10', value: '10' },
                      { label: '100', value: '100' },
                      { label: '1K', value: '1000' },
                      { label: '10K', value: '10000' },
                      { label: 'Max', value: 'max' as const },
                    ]
                  ).map((qa) => {
                    const isMax = qa.value === 'max';
                    const active = isMax ? (mpBalance && amount === mpBalance) : amount === qa.value;
                    const disabled = predicting || (isMax && (!userAddress || mpBalanceLoading));
                    return (
                      <button
                        key={qa.label}
                        type="button"
                        onClick={() => {
                          if (isMax) {
                            void (async () => {
                              const v = await loadMpBalance();
                              setAmount(v);
                            })();
                            return;
                          }
                          setAmount(qa.value);
                        }}
                        disabled={disabled}
                        style={{
                          flex: 1,
                          minWidth: '5.25rem',
                          padding: '0.75rem 0.5rem',
                          borderRadius: '0.5rem',
                          fontWeight: 'bold',
                          fontSize: '0.875rem',
                          transition: 'all 0.2s',
                          backgroundColor: active ? '#00C4BA' : 'var(--mp-bg)',
                          color: active ? '#0B0C10' : 'var(--mp-fg)',
                          border: `2px solid ${active ? '#00C4BA' : 'rgba(0,196,186,0.3)'}`,
                          boxShadow: active ? '0 0 20px rgba(0,196,186,0.6)' : 'none',
                          transform: active ? 'scale(1.05)' : 'scale(1)',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          if (!active) {
                            e.currentTarget.style.borderColor = '#00C4BA';
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!active) {
                            e.currentTarget.style.borderColor = 'rgba(0,196,186,0.3)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                        title={isMax ? `Max (${Number(mpBalance || '0').toFixed(4)} BDAG)` : undefined}
                      >
                        {qa.label}
                      </button>
                    );
                  })}
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
                      backgroundColor: 'var(--mp-bg)',
                      border: '2px solid rgba(0,196,186,0.5)',
                      borderRadius: '0.5rem',
                      color: 'var(--mp-fg)',
                      outline: 'none',
                      transition: 'all 0.3s',
                      boxShadow: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'textfield'
                    }}
                    className="placeholder:text-[color:var(--mp-fg-muted)] focus:border-[#00C4BA] focus:shadow-[0_0_10px_rgba(0,196,186,0.5)]"
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
                <p className="text-xs mp-text-muted mt-2">
                  💰 Uses your MarketPredict balance. <Link href="/wallet" className="text-[#00C4BA] hover:underline">Deposit funds here</Link>
                </p>
              </div>

              <div>
                <div style={{ position: 'relative' }}>
                  {flashWarning && (
                    <div
                      aria-live="polite"
                      className="p-4 rounded-lg text-center"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '-3.75rem',
                        zIndex: 50,
                        backgroundColor: 'rgba(249, 115, 22, 0.15)',
                        border: '1px solid rgba(249, 115, 22, 0.55)',
                        color: 'var(--mp-fg)',
                        opacity: 0.85,
                        animation: 'mpSlowBlink 3.2s ease-in-out infinite',
                      }}
                    >
                      <span style={{ marginRight: '0.5rem' }}>⚠️</span>
                      Please pick <strong>YES</strong> or <strong>NO</strong> and enter your amount
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      if (!amount || Number(amount) <= 0 || !side) {
                        e.preventDefault();
                        setFlashWarning(true);
                        setTimeout(() => setFlashWarning(false), 3200);
                        return;
                      }
                      handlePredict();
                    }}
                    disabled={predicting}
                    className="w-full font-bold disabled:opacity-50 disabled:cursor-not-allowed relative group"
                    style={{
                      padding: '2rem 1rem',
                      fontSize: '1.25rem',
                      borderRadius: '0.75rem',
                      transition: 'all 0.3s ease',
                      backgroundColor: side === "yes" ? '#00FFA3' : (side === "no" ? '#ef4444' : 'transparent'),
                      color: side === "yes" ? '#0B0C10' : (side === "no" ? '#ffffff' : 'var(--mp-fg)'),
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

                  <div className="text-sm mp-text-muted text-center mt-3" style={{ color: 'var(--mp-fg)' }}>
                    Closes at <strong>{formatDateTime(Number(market.closeTime))}</strong>
                  </div>
                </div>
              </div>

              <p className="text-sm mp-text-muted text-center mt-4">
                🔒 Your prediction is locked until the market resolves
              </p>

              <div className="mt-6 p-4 bg-[#00C4BA]/10 border border-[#00C4BA]/30 rounded-lg">
                <h3 className="text-sm font-bold text-[#00C4BA] mb-2">💡 How Predictions Work</h3>
                <ul className="text-xs mp-text-muted space-y-1 list-none">
                  <li>• Pick Yes or No, enter crypto amount, click submit</li>
                  <li>• Your prediction joins your side&apos;s pool (YES or NO)</li>
                  <li>• If you&apos;re right, you win your proportional share of the losing pool</li>
                  <li>• Wins give you your prediction back PLUS your profits (minus 2.9% platform fee)</li>
                  <li>• After market resolves, click &quot;Claim Winnings&quot; to collect your earnings</li>
                  <li>• Predictions are final - you cannot trade or withdraw your prediction until market resolves</li>
                </ul>
              </div>

              {/* Pro Tips Section */}
              <div className="mt-4 p-4 rounded-lg" style={{
                background: 'linear-gradient(135deg, rgba(255,111,51,0.1) 0%, rgba(0,196,186,0.1) 100%)',
                border: '2px solid rgba(255,111,51,0.3)'
              }}>
                <h3 className="text-sm font-bold mb-2" style={{ color: '#FF6F33' }}>🎯 Pro Tips</h3>
                <ul className="text-xs mp-text-muted space-y-1 list-none">
                  <li>• Watch pool sizes - the smaller your side&apos;s pool, the bigger your winnings</li>
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
                    <p className="text-sm" style={{ color: 'var(--mp-fg)' }}>
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
                  <p className="text-xs mp-text-muted mt-3">Click above to collect your earnings</p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="mb-4" style={{ color: 'var(--mp-fg)' }}>⏰ This market has expired and is awaiting resolution</p>
                  <p className="text-xs mp-text-muted">The market owner will resolve this market shortly</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style jsx global>{`
        @keyframes mpSlowBlink {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </main>
  );
}