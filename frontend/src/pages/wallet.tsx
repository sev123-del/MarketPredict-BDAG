"use client";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

export default function Wallet() {
  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("0");
  const [walletBalance, setWalletBalance] = useState("0");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [txMessage, setTxMessage] = useState("");
  const [txType, setTxType] = useState<"success" | "error" | "">("");
  const [walletProvider, setWalletProvider] = useState("your wallet");

  useEffect(() => {
    checkConnection();
    detectWalletProvider();
  }, []);

  const checkConnection = async () => {
    if (!(window as any).ethereum) return;

    try {
      const accounts = await (window as any).ethereum.request({ 
        method: 'eth_accounts' 
      });
      
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        await loadBalances(accounts[0]);
      }
    } catch (err) {
      console.error("Failed to check connection:", err);
    }
  };

  const detectWalletProvider = () => {
    if (!(window as any).ethereum) return;
    
    const ethereum = (window as any).ethereum;
    if (ethereum.isMetaMask) {
      setWalletProvider("MetaMask");
    } else if (ethereum.isCoinbaseWallet) {
      setWalletProvider("Coinbase Wallet");
    } else if (ethereum.isRabby) {
      setWalletProvider("Rabby");
    } else if (ethereum.isTrust) {
      setWalletProvider("Trust Wallet");
    } else {
      setWalletProvider("your wallet");
    }
  };

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      alert("🦊 Please install MetaMask to use this feature!");
      return;
    }

    try {
      const accounts = await (window as any).ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      setAccount(accounts[0]);
      await loadBalances(accounts[0]);
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  };

  const loadBalances = async (userAddress: string) => {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      // Get dApp balance
      const dappBal = await contract.getBalance(userAddress);
      setBalance(ethers.formatEther(dappBal));

      // Get wallet balance
      const walletBal = await provider.getBalance(userAddress);
      setWalletBalance(ethers.formatEther(walletBal));
    } catch (err) {
      console.error("Failed to load balances:", err);
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
      showMessage("Please enter a valid amount", "error");
      return;
    }

    if (Number(depositAmount) > Number(walletBalance)) {
      showMessage("Insufficient wallet balance", "error");
      return;
    }

    try {
      setDepositLoading(true);
      setTxMessage("");

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.deposit({ 
        value: ethers.parseEther(depositAmount) 
      });

      showMessage("⏳ Processing deposit...", "success");
      await tx.wait();

      showMessage(`✅ Successfully deposited ${depositAmount} BDAG!`, "success");
      setDepositAmount("");
      await loadBalances(account);
    } catch (err: any) {
      console.error("Deposit failed:", err);
      showMessage(err.message || "❌ Deposit failed", "error");
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || isNaN(Number(withdrawAmount)) || Number(withdrawAmount) <= 0) {
      showMessage("Please enter a valid amount", "error");
      return;
    }

    if (Number(withdrawAmount) > Number(balance)) {
      showMessage("Insufficient dApp balance", "error");
      return;
    }

    try {
      setWithdrawLoading(true);
      setTxMessage("");

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.withdraw(ethers.parseEther(withdrawAmount));

      showMessage("⏳ Processing withdrawal...", "success");
      await tx.wait();

      showMessage(`✅ Successfully withdrew ${withdrawAmount} BDAG!`, "success");
      setWithdrawAmount("");
      await loadBalances(account);
    } catch (err: any) {
      console.error("Withdrawal failed:", err);
      showMessage(err.message || "❌ Withdrawal failed", "error");
    } finally {
      setWithdrawLoading(false);
    }
  };

  const showMessage = (message: string, type: "success" | "error") => {
    setTxMessage(message);
    setTxType(type);
    setTimeout(() => {
      setTxMessage("");
      setTxType("");
    }, 5000);
  };

  const setMaxDeposit = () => {
    const maxAmount = Math.max(0, Number(walletBalance) - 0.01); // Leave some for gas
    setDepositAmount(maxAmount.toFixed(4));
  };

  const setMaxWithdraw = () => {
    setWithdrawAmount(balance);
  };

  if (!account) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 relative z-10">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#00FFA3] to-[#0072FF] flex items-center justify-center shadow-[0_0_50px_rgba(0,255,163,0.5)]">
            <span className="text-5xl">👛</span>
          </div>
          <h1 className="text-4xl font-bold text-[#E5E5E5] mb-4">Connect Your Wallet</h1>
          <p className="text-[#E5E5E5]/70 mb-8">
            Connect your wallet to deposit BDAG and start making predictions!
          </p>
          <button onClick={connectWallet} className="btn-glow text-lg py-4 px-8">
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pt-20 pb-20 relative z-10">
      <div style={{ maxWidth: '42rem', margin: '0 auto' }}>
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="hero-title mb-4">Your Wallet</h1>
          <p className="text-xl text-[#E5E5E5]/70">
            Manage your BDAG balance for predictions
          </p>
        </div>

        {/* Success/Error Message */}
        {txMessage && (
          <div className={`mb-6 p-4 rounded-lg border text-center font-semibold slide-in ${
            txType === "success" 
              ? "bg-green-500/20 border-green-500 text-green-400" 
              : "bg-red-500/20 border-red-500 text-red-400"
          }`}>
            {txMessage}
          </div>
        )}

        {/* Balance Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* Wallet Balance */}
          <div className="bg-[#1a1d2e] p-8 rounded-lg border border-[#5BA3FF]/50 shadow-[0_0_30px_rgba(91,163,255,0.2)]">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">💳</span>
              <h2 className="text-lg text-[#E5E5E5]/70">Wallet Balance</h2>
            </div>
            <p className="text-4xl font-bold text-[#5BA3FF] mb-2">
              {Number(walletBalance).toFixed(4)} BDAG
            </p>
            <p className="text-sm text-[#E5E5E5]/50">In {walletProvider}</p>
          </div>

          {/* MarketPredict Balance */}
          <div className="bg-[#1a1d2e] p-8 rounded-lg border border-[#00FFA3]/50 shadow-[0_0_30px_rgba(0,255,163,0.3)]">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">🎯</span>
              <h2 className="text-lg text-[#E5E5E5]/70">MarketPredict Balance</h2>
            </div>
            <p className="text-4xl font-bold text-[#00FFA3] mb-2">
              {Number(balance).toFixed(4)} BDAG
            </p>
            <p className="text-sm text-[#E5E5E5]/50">Available for predictions</p>
          </div>
        </div>

        {/* Deposit Section */}
        <div className="bg-[#1a1d2e] p-8 rounded-lg border border-[#00FFA3]/30 shadow-[0_0_30px_rgba(0,255,163,0.2)] mb-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-4xl">💰</span>
            <div>
              <h2 className="text-2xl font-bold text-[#00FFA3]">Deposit BDAG</h2>
              <p className="text-sm text-[#E5E5E5]/60">Add funds to make predictions</p>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-start gap-4 mb-2">
              <label className="text-[#E5E5E5] font-semibold">Amount</label>
              <button
                onClick={setMaxDeposit}
                className="px-3 py-1 bg-[#00FFA3]/20 hover:bg-[#00FFA3]/30 border border-[#00FFA3]/50 rounded text-[#00FFA3] text-xs font-semibold transition-all"
                disabled={depositLoading}
              >
                Deposit Max ({Number(walletBalance).toFixed(4)} BDAG)
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-4 bg-[#0B0C10] border border-[#00FFA3]/50 rounded-lg text-[#E5E5E5] text-xl placeholder-[#E5E5E5]/30 focus:outline-none focus:border-[#00FFA3] focus:shadow-[0_0_15px_rgba(0,255,163,0.5)] transition-all"
              disabled={depositLoading}
            />
            <p className="text-xs text-[#E5E5E5]/50 mt-2">
              💡 Keep some BDAG in your wallet for gas fees
            </p>
          </div>

          <button
            onClick={handleDeposit}
            disabled={depositLoading || !depositAmount}
            className="w-full btn-glow py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {depositLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner"></span> Processing...
              </span>
            ) : (
              "💰 Deposit to MarketPredict"
            )}
          </button>
        </div>

        {/* Withdraw Section */}
        <div className="bg-[#1a1d2e] p-8 rounded-lg border border-[#5BA3FF]/30 shadow-[0_0_30px_rgba(91,163,255,0.2)]">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-4xl">🏦</span>
            <div>
              <h2 className="text-2xl font-bold text-[#5BA3FF]">Withdraw BDAG</h2>
              <p className="text-sm text-[#E5E5E5]/60">Return funds to your wallet</p>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-start gap-4 mb-2">
              <label className="text-[#E5E5E5] font-semibold">Amount</label>
              <button
                onClick={setMaxWithdraw}
                className="px-3 py-1 bg-[#5BA3FF]/20 hover:bg-[#5BA3FF]/30 border border-[#5BA3FF]/50 rounded text-[#5BA3FF] text-xs font-semibold transition-all"
                disabled={withdrawLoading}
              >
                Withdraw Max ({Number(balance).toFixed(4)} BDAG)
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-4 bg-[#0B0C10] border border-[#5BA3FF]/50 rounded-lg text-[#E5E5E5] text-xl placeholder-[#E5E5E5]/30 focus:outline-none focus:border-[#5BA3FF] focus:shadow-[0_0_15px_rgba(91,163,255,0.5)] transition-all"
              disabled={withdrawLoading}
            />
            <p className="text-xs text-[#E5E5E5]/50 mt-2">
              ⚡ You'll need to pay gas fees for this transaction
            </p>
          </div>

          <button
            onClick={handleWithdraw}
            disabled={withdrawLoading || !withdrawAmount || Number(balance) === 0}
            className="w-full btn-glow-blue py-4 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {withdrawLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner"></span> Processing...
              </span>
            ) : (
              "🏦 Withdraw to Wallet"
            )}
          </button>
        </div>

        {/* Help Section */}
        <div className="mt-12 p-6 bg-[#5BA3FF]/10 border border-[#5BA3FF]/30 rounded-lg">
          <h3 className="text-lg font-bold text-[#00FFA3] mb-4">💡 How It Works</h3>
          <div className="space-y-3 text-sm text-[#E5E5E5]/80">
            <p>
              <strong className="text-[#00FFA3]">1. Deposit:</strong> Transfer BDAG from your wallet to MarketPredict. This balance is used to place predictions.
            </p>
            <p>
              <strong className="text-[#00FFA3]">2. Predict:</strong> Use your MarketPredict balance to predict YES or NO on markets.
            </p>
            <p>
              <strong className="text-[#00FFA3]">3. Withdraw:</strong> Anytime you want, move your funds back to your wallet.
            </p>
            <p className="pt-2 border-t border-[#E5E5E5]/10">
              🔒 <strong>Security:</strong> Your funds are always under your control. We will never ask for your wallet's secret phrase.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
