'use client';
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import logger from "../lib/logger";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";
import { isAllowedCreator } from "../configs/creators";
import { useWallet } from "../context/WalletContext";
import Avatar from "./Avatar";

export default function Header() {
  const { account, ethereum, connect: connectFromContext } = useWallet();
  const [isOwner, setIsOwner] = useState(false);
  const [isCreatorAllowed, setIsCreatorAllowed] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [notice, setNotice] = useState<string>("");

  // Helpers: safe ethereum getter and error normalization
  type JsonRpcRequest = { method: string; params?: unknown[] | Record<string, unknown> };
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
      setNotice("No wallet detected. Install MetaMask (or a compatible wallet) to continue.");
      setTimeout(() => setNotice(""), 6000);
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
        setNotice("Failed to connect wallet. Please try again.");
        setTimeout(() => setNotice(""), 6000);
      }
    }
  };

  return (
    <header className="relative z-50" data-mp-header-build="2025-12-30" data-mp-logo-offset="pl-10 sm:pl-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-3 pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div className="flex items-center gap-4 min-w-0 pl-10 sm:pl-14">
            <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity min-w-0 no-underline">
              <h1
                className="font-orbitron text-2xl sm:text-4xl md:text-5xl font-extrabold leading-none truncate bg-linear-to-r from-[#00FFA3] to-[#0072FF] text-transparent bg-clip-text tracking-[-0.08em]"
              >
                MarketPredict
              </h1>
            </Link>

            {/* Live Markets badge — separate from the home link */}
            <div className="hidden sm:inline-flex live-badge ml-2">
              <div className="live-dot" />
              <span className="text-[#00FFA3] font-bold whitespace-nowrap">Live Markets</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            {/* Identity cluster (top-right). Keeps primary identity visible without turning into a dropdown. */}
            <div className="flex items-center gap-2 shrink-0">
              {account ? (
                <>
                  <div className="pointer-events-none" aria-hidden="true">
                    <Avatar seed={account} saltIndex={0} size={32} variant={undefined} />
                  </div>
                  <Link
                    href="/wallet"
                    className="mp-chip m-0! rounded-full font-mono max-w-48 truncate no-underline"
                    aria-label="Open wallet"
                  >
                    {`${account.slice(0, 6)}...${account.slice(-4)}`}
                  </Link>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/profile" className="mp-chip rounded-full font-semibold">
                    Join
                  </Link>
                  <button type="button" className="mp-chip rounded-full font-semibold" onClick={connectWallet}>
                    Log in
                  </button>
                </div>
              )}
            </div>

            {/* Secondary links remain accessible on mobile (wrapped) to avoid critical links "vanishing". */}
            <nav aria-label="Secondary" className="hidden md:flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/markets"
                className="px-3 py-2 rounded-md transition-colors font-semibold"
                style={{ color: 'var(--mp-link)' }}
              >
                Markets
              </Link>

              {(isOwner || isCreatorAllowed) && (
                <Link
                  href="/create-market"
                  className="px-3 py-2 rounded-md transition-colors font-semibold"
                  style={{ color: 'var(--mp-link)' }}
                >
                  Create
                </Link>
              )}

              <Link
                href="/wallet"
                className="px-3 py-2 rounded-md transition-colors font-semibold"
                style={{ color: 'var(--mp-link)' }}
              >
                Wallet
              </Link>

              <Link
                href="/profile"
                className="px-3 py-2 rounded-md transition-colors font-semibold"
                style={{ color: 'var(--mp-link)' }}
              >
                Profile
              </Link>

              <Link
                href="/settings"
                className="px-3 py-2 rounded-md transition-colors font-semibold"
                style={{ color: 'var(--mp-link)' }}
              >
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </div>

      {notice && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-4">
          <div className="p-3 rounded-lg border border-orange-500/40 bg-orange-500/10 text-orange-200 text-sm">
            {notice}
          </div>
        </div>
      )}
    </header>
  );
}