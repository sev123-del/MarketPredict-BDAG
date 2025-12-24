'use client';
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import logger from "../lib/logger";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";
import { isAllowedCreator } from "../configs/creators";
import { useWallet } from "../context/WalletContext";

export default function Header() {
  const { account, ethereum, connect: connectFromContext } = useWallet();
  const [isOwner, setIsOwner] = useState(false);
  const [isCreatorAllowed, setIsCreatorAllowed] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Helpers: safe ethereum getter and error normalization
  type JsonRpcRequest = { method: string; params?: any[] | Record<string, any> };
  type InjectedProvider = {
    request: (req: JsonRpcRequest) => Promise<unknown>;
    on?: (evt: string, cb: (...args: unknown[]) => void) => void;
    removeListener?: (evt: string, cb: (...args: unknown[]) => void) => void;
  };
  const extractErrorInfo = (err: unknown) => {
    const result: { message: string; code?: string | number } = { message: String(err ?? 'Unknown error') };
    if (err instanceof Error) {
      result.message = err.message || String(err);
      return result;
    }
    if (typeof err === 'object' && err !== null) {
      try {
        const asRecord = err as Record<string, unknown>;
        if (typeof asRecord.message === 'string') result.message = asRecord.message;
        if (asRecord.code !== undefined) result.code = asRecord.code as string | number;
      } catch {
        // ignore
      }
    }
    return result;
  };

  const loadUserProfile = useCallback(async (address: string) => {
    if (!address) return;

    setIsLoadingProfile(true);
    try {
      const provider = ethereum ? new ethers.BrowserProvider(ethereum as InjectedProvider) : null;
      if (!provider) {
        const { warn } = await import('../lib/logger');
        warn('No RPC or injected provider available for reading profile');
        setUsername('');
        return;
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const fetchedUsername = await contract.usernames(address).catch(() => "");

      setUsername(fetchedUsername || "");
    } catch (err) {
      logger.error('Error loading profile:', err);
      setUsername("");
    } finally {
      setIsLoadingProfile(false);
    }
  }, [ethereum]);

  // When account changes, refresh owner/creator flags and profile.
  useEffect(() => {
    (async () => {
      if (!account) {
        setIsOwner(false);
        setIsCreatorAllowed(false);
        setUsername('');
        return;
      }

      try {
        const provider = ethereum ? new ethers.BrowserProvider(ethereum as InjectedProvider) : null;
        let onchainOwner = "";
        if (provider) {
          try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            const o = await contract.owner();
            onchainOwner = String(o).toLowerCase();
          } catch (e) {
            logger.warn('Failed to read on-chain owner:', e);
          }
        }

        const isOwnerLocal = onchainOwner !== "" && account.toLowerCase() === onchainOwner;
        const allowedOffchain = isAllowedCreator(account);
        setIsOwner(isOwnerLocal);
        setIsCreatorAllowed(isOwnerLocal || allowedOffchain);
      } catch {
        setIsOwner(false);
        setIsCreatorAllowed(isAllowedCreator(account));
      }

      loadUserProfile(account);
    })();
  }, [account, ethereum, loadUserProfile]);

  const connectWallet = async () => {
    if (!ethereum) {
      alert("🦊 Please install MetaMask to use this dApp!");
      return;
    }
    try {
      await connectFromContext();
    } catch (error: unknown) {
      const info = extractErrorInfo(error);
      if (info.code === 4001 || String(info.code) === '4001') {
        logger.debug('User rejected connection');
      } else {
        logger.error('Failed to connect wallet:', info.message);
        alert("Failed to connect wallet. Please try again.");
      }
    }
  };

  return (
    <header className="relative z-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex justify-between items-center py-6">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity min-w-0">
            <div className="w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-[#00FFA3] to-[#0072FF] shadow-[0_0_25px_rgba(0,255,163,0.8)] animate-pulse" />
            <h1
              className="font-orbitron text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#00FFA3] to-[#0072FF] drop-shadow-[0_0_16px_rgba(0,255,163,0.8)] leading-none truncate"
              style={{ letterSpacing: "0.05em" }}
            >
              MarketPredict
            </h1>
          </Link>

          {/* Live Markets badge — separate from the home link */}
          <div className="mt-0 live-badge">
            <div className="live-dot" />
            <span className="text-[#00FFA3] font-bold whitespace-nowrap">Live Markets</span>
          </div>
        </div>

        <nav className="flex items-center gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/markets"
              className="text-[#E5E5E5] hover:text-[#00FFA3] transition-colors font-medium hover:scale-110 transform"
            >
              🌐 Markets
            </Link>

            {(isOwner || isCreatorAllowed) && (
              <Link
                href="/create-market"
                className="text-[#E5E5E5] hover:text-[#00FFA3] transition-colors font-medium hover:scale-110 transform"
              >
                ➕ Create
              </Link>
            )}

            <Link
              href="/wallet"
              className="text-[#E5E5E5] hover:text-[#0072FF] transition-colors font-medium hover:scale-110 transform"
            >
              💰 Wallet
            </Link>

            <Link
              href="/profile"
              className="text-[#E5E5E5] hover:text-[#00FFA3] transition-colors font-medium hover:scale-110 transform"
            >
              👤 Profile
            </Link>

            <Link
              href="/settings"
              className="text-[#E5E5E5] hover:text-[#00FFA3] transition-colors font-medium hover:scale-110 transform"
            >
              ⚙️ Settings
            </Link>
          </div>

          {/* Wallet Button with Profile Dropdown (always visible) */}
          <div className="relative">
            <button
              className="btn-glow hover:scale-105 transform transition-all font-mono"
              onClick={account ? () => (window.location.href = '/wallet') : connectWallet}
            >
              {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "🦊 Connect Wallet"}
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}