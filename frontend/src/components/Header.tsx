'use client';
import { useState, useEffect } from "react";
import Link from "next/link";

// Owner address - only this address can create/edit/delete markets
const OWNER_ADDRESS = "0x539bAA99044b014e453CDa36C4AD3dE5E4575367".toLowerCase();

export default function Header() {
  const [account, setAccount] = useState<string>("");
  const [isOwner, setIsOwner] = useState(false);

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      alert("Please install MetaMask!");
      return;
    }
    try {
      const accounts = await (window as any).ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      setAccount(accounts[0]);
      setIsOwner(accounts[0].toLowerCase() === OWNER_ADDRESS);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  useEffect(() => {
    if ((window as any).ethereum) {
      // Check if already connected
      (window as any).ethereum.request({ method: 'eth_accounts' })
        .then((accounts: string[]) => {
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            setIsOwner(accounts[0].toLowerCase() === OWNER_ADDRESS);
          }
        });

      // Listen for account changes
      (window as any).ethereum.on('accountsChanged', (accounts: string[]) => {
        setAccount(accounts[0] || "");
        setIsOwner(accounts[0] ? accounts[0].toLowerCase() === OWNER_ADDRESS : false);
      });
    }
  }, []);

  return (
    <header className="flex justify-between items-center px-8 py-6">
      <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00FFA3] to-[#0072FF] shadow-[0_0_25px_rgba(0,255,163,0.8)]" />
        <h1
          className="font-orbitron text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#00FFA3] to-[#0072FF] drop-shadow-[0_0_16px_rgba(0,255,163,0.8)] leading-none"
          style={{ letterSpacing: "0.05em" }}
        >
          MarketPredict
        </h1>
      </Link>
      
      <div className="flex items-center gap-4">
        <Link href="/markets" className="text-[#E5E5E5] hover:text-[#00FFA3] transition-colors font-medium">
          Markets
        </Link>
        {isOwner && (
          <Link href="/create-market" className="text-[#E5E5E5] hover:text-[#00FFA3] transition-colors font-medium">
            Create
          </Link>
        )}
        <Link href="/wallet" className="text-[#E5E5E5] hover:text-[#0072FF] transition-colors font-medium">
          💰 Wallet
        </Link>
        <Link href="/settings" className="text-[#E5E5E5] hover:text-[#00FFA3] transition-colors font-medium">
          🛡️ Settings
        </Link>
        <button className="btn-glow" onClick={connectWallet}>
          {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}
        </button>
      </div>
    </header>
  );
}
