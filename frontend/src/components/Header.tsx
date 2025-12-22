'use client';
import { useState, useEffect } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";
import { ALLOWED_CREATORS, isAllowedCreator } from "../configs/creators";

export default function Header() {
  const [account, setAccount] = useState<string>("");
  const [isOwner, setIsOwner] = useState(false);
  const [isCreatorAllowed, setIsCreatorAllowed] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const loadUserProfile = async (address: string) => {
    if (!address) return;

    setIsLoadingProfile(true);
    try {
      const readProvider = () => {
        if (typeof window !== 'undefined' && (window as any).ethereum) return new ethers.BrowserProvider((window as any).ethereum);
        return null;
      };

      const provider = readProvider();
      if (!provider) {
        console.warn('No RPC or injected provider available for reading profile');
        setUsername('');
        return;
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const fetchedUsername = await contract.usernames(address).catch(() => "");

      setUsername(fetchedUsername || "");
    } catch (err) {
      console.error("Error loading profile:", err);
      setUsername("");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      alert("🦊 Please install MetaMask to use this dApp!");
      return;
    }
    try {
      const accounts = await (window as any).ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (accounts && accounts.length > 0) {
        const addr = accounts[0];
        setAccount(addr);
        const readProvider = () => {
          if (typeof window !== 'undefined' && (window as any).ethereum) return new ethers.BrowserProvider((window as any).ethereum);
          return null;
        };

        const provider = readProvider();
        let onchainOwner = "";
        if (provider) {
          try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            const o = await contract.owner();
            onchainOwner = String(o).toLowerCase();
          } catch (e) {
            console.warn("Failed to read on-chain owner:", e);
          }
        }

        const isOwnerLocal = onchainOwner !== "" && addr.toLowerCase() === onchainOwner;
        const allowedOffchain = isAllowedCreator(addr);

        setIsOwner(isOwnerLocal);
        setIsCreatorAllowed(isOwnerLocal || allowedOffchain);

        await loadUserProfile(addr);
      }
    } catch (error: any) {
      if (error.code === 4001) {
        console.log("User rejected connection");
      } else {
        console.error("Failed to connect wallet:", error);
        alert("Failed to connect wallet. Please try again.");
      }
    }
  };

  useEffect(() => {
    if ((window as any).ethereum) {
      (window as any).ethereum.request({ method: 'eth_accounts' })
        .then(async (accounts: string[]) => {
          if (accounts && accounts.length > 0) {
            const addr = accounts[0];
            setAccount(addr);

            const readProvider = () => {
              if (typeof window !== 'undefined' && (window as any).ethereum) return new ethers.BrowserProvider((window as any).ethereum);
              return null;
            };

            const provider = readProvider();
            let onchainOwner = "";
            if (provider) {
              try {
                const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
                const o = await contract.owner();
                onchainOwner = String(o).toLowerCase();
              } catch (e) {
                console.warn("Failed to read on-chain owner:", e);
              }
            }

            const isOwnerLocal = onchainOwner !== "" && addr.toLowerCase() === onchainOwner;
            const allowedOffchain = isAllowedCreator(addr);

            setIsOwner(isOwnerLocal);
            setIsCreatorAllowed(isOwnerLocal || allowedOffchain);

            loadUserProfile(addr);
          }
        })
        .catch((err: any) => console.error("Error checking accounts:", err));

      const handleAccountsChanged = (accounts: string[]) => {
        const addr = accounts[0] || "";
        setAccount(addr);
        // refresh on-chain owner check + allowlist
        (async () => {
          if (!addr) {
            setIsOwner(false);
            setIsCreatorAllowed(false);
            setUsername("");
            return;
          }
          try {
            if (typeof window !== 'undefined' && (window as any).ethereum) {
              try {
                const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
                const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, browserProvider);
                const o = await contract.owner();
                const onchainOwner = String(o).toLowerCase();
                const isOwnerLocal = addr.toLowerCase() === onchainOwner;
                const allowedOffchain = isAllowedCreator(addr);
                setIsOwner(isOwnerLocal);
                setIsCreatorAllowed(isOwnerLocal || allowedOffchain);
              } catch (e) {
                setIsOwner(false);
                setIsCreatorAllowed(isAllowedCreator(addr));
              }
            } else {
              setIsOwner(false);
              setIsCreatorAllowed(isAllowedCreator(addr));
            }
          } catch (e) {
            setIsOwner(false);
            setIsCreatorAllowed(isAllowedCreator(addr));
          }
        })();
        if (addr) {
          loadUserProfile(addr);
        } else {
          setUsername("");
        }
      };

      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);

      return () => {
        if ((window as any).ethereum?.removeListener) {
          (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, []);

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