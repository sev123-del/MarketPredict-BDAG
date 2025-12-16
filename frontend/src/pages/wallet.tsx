"use client";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

export default function Wallet() {
  const [account, setAccount] = useState("");
  const [walletBalance, setWalletBalance] = useState("0");
  const [mpBalance, setMpBalance] = useState("0");
  const [openPredictions, setOpenPredictions] = useState("0");
  const [unclaimedWinnings, setUnclaimedWinnings] = useState("0");
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

  useEffect(() => {
    if (!account) return;
    loadBalances(account);
    const interval = setInterval(() => loadBalances(account), 15000);
    return () => clearInterval(interval);
  }, [account]);

  const checkConnection = async () => {
    if (!(window as any).ethereum) return;
    try {
      const accounts = await (window as any).ethereum.request({
        method: "eth_accounts",
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
    if (ethereum.isMetaMask) setWalletProvider("MetaMask");
    else if (ethereum.isCoinbaseWallet) setWalletProvider("Coinbase Wallet");
    else if (ethereum.isRabby) setWalletProvider("Rabby");
    else if (ethereum.isTrust) setWalletProvider("Trust Wallet");
    else setWalletProvider("your wallet");
  };

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      alert("🦊 Please install MetaMask to use this feature!");
      return;
    }
    try {
      const accounts = await (window as any).ethereum.request({
        method: "eth_requestAccounts",
      });
      setAccount(accounts[0]);
      await loadBalances(accounts[0]);
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  };

  const loadBalances = async (userAddress: string) => {
    try {
      const PUBLIC_RPC = '';
      const rpcProvider = PUBLIC_RPC ? new ethers.JsonRpcProvider(PUBLIC_RPC) : null;
      const browserProvider = (window as any).ethereum ? new ethers.BrowserProvider((window as any).ethereum) : null;

      // Wallet balance: prefer injected provider (more accurate for user's current chain/account),
      // but fallback to public RPC if that fails.
      let walletBal: bigint = BigInt(0);
      if (browserProvider) {
        try {
          walletBal = await browserProvider.getBalance(userAddress);
        } catch (e) {
          try {
            if (rpcProvider) walletBal = await rpcProvider.getBalance(userAddress);
            else walletBal = BigInt(0);
          } catch (_) {
            walletBal = BigInt(0);
          }
        }
      } else {
        try {
          walletBal = await rpcProvider.getBalance(userAddress);
        } catch (_) {
          walletBal = BigInt(0);
        }
      }
      setWalletBalance(ethers.formatEther(walletBal));

      // Read-only contract calls should use the public RPC provider to avoid
      // prompting users and to be resilient in read-only contexts.
      const contractRead = rpcProvider ? new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rpcProvider) : null;

      // Prepare a browser-provider contract fallback if available
      const contractBrowser = browserProvider ? new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, browserProvider) : null;

      // Get dApp (MarketPredict) balance with graceful fallbacks
      let mpBal: any = BigInt(0);
      if (contractRead) {
        try {
          mpBal = await contractRead.getBalance(userAddress);
        } catch (err) {
          try {
            const fallback = await contractRead.balances(userAddress);
            mpBal = fallback;
          } catch (err2) {
            if (contractBrowser) {
              try {
                mpBal = await contractBrowser.getBalance(userAddress);
              } catch (_) {
                mpBal = BigInt(0);
              }
            } else {
              mpBal = BigInt(0);
            }
          }
        }
      } else if (contractBrowser) {
        try {
          mpBal = await contractBrowser.getBalance(userAddress);
        } catch (_) {
          mpBal = BigInt(0);
        }
      } else {
        mpBal = BigInt(0);
      }
      setMpBalance(ethers.formatEther(mpBal || BigInt(0)));

      // Compute open predictions: batch reads (parallel per batch) to improve UX and reduce latency.
      try {
        const countBn = contractRead ? await contractRead.marketCount() : contractBrowser ? await contractBrowser.marketCount().catch(() => BigInt(0)) : BigInt(0);
        const n = Number(countBn);
        const scanLimit = Math.min(n, 200); // keep client-side scan bounded
        let openTotal: bigint = BigInt(0);
        const batchSize = 20;

        for (let start = 0; start < scanLimit; start += batchSize) {
          const end = Math.min(scanLimit, start + batchSize);
          const basicsPromises: Promise<any>[] = [];
          const posPromises: Promise<any>[] = [];
          for (let i = start; i < end; i++) {
            if (contractRead) {
              basicsPromises.push(contractRead.getMarketBasics(i).catch(() => null));
              posPromises.push(contractRead.getUserPosition(i, userAddress).catch(() => null));
            } else if (contractBrowser) {
              basicsPromises.push(contractBrowser.getMarketBasics(i).catch(() => null));
              posPromises.push(contractBrowser.getUserPosition(i, userAddress).catch(() => null));
            } else {
              basicsPromises.push(Promise.resolve(null));
              posPromises.push(Promise.resolve(null));
            }
          }

          const basicsResults = await Promise.all(basicsPromises);
          const posResults = await Promise.all(posPromises);

          for (let idx = 0; idx < basicsResults.length; idx++) {
            const basics = basicsResults[idx];
            const pos = posResults[idx];
            if (!basics || !pos) continue;
            const status = Number(basics.status);
            if (status !== 0) continue; // only active/open markets

            const yesAmount: bigint = BigInt(pos.yesAmount ?? 0);
            const noAmount: bigint = BigInt(pos.noAmount ?? 0);
            const claimed: boolean = Boolean(pos.claimed);
            if (!claimed && (yesAmount + noAmount) > BigInt(0)) {
              openTotal += yesAmount + noAmount;
            }
          }
        }

        setOpenPredictions(ethers.formatEther(openTotal));
      } catch (errCount) {
        setOpenPredictions("0");
      }

      setUnclaimedWinnings("0");
    } catch (err: any) {
      console.error("Failed to load balances:", err?.message || err);
      setWalletBalance("0");
      setMpBalance("0");
      setOpenPredictions("0");
      setUnclaimedWinnings("0");
    }
  };

  const isUserRejected = (err: any): boolean => {
    if (!err) return false;

    const code = err?.code;
    const reason = err?.reason;
    const message = String(err?.message || "").toLowerCase();

    if (code === "ACTION_REJECTED" || code === 4001) return true;
    if (reason === "rejected") return true;
    if (message.includes("user rejected") || message.includes("user denied")) return true;
    if (message.includes("action=\"sendTransaction\"") && message.includes("reason=\"rejected\"")) return true;

    return false;
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

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const amountWei = ethers.parseEther(depositAmount);
      const tx = await contract.deposit({ value: amountWei });
      await tx.wait();

      showMessage("✅ Deposit successful!", "success");
      setDepositAmount("");
      await loadBalances(await signer.getAddress());
    } catch (err: any) {
      console.error("Deposit error:", err);

      if (isUserRejected(err)) {
        showMessage("💭 Transaction cancelled by user", "error");
      } else {
        const errorMsg = String(err?.message || "").split("\n")[0];
        showMessage(`❌ ${errorMsg || "Deposit failed"}`, "error");
      }
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || isNaN(Number(withdrawAmount)) || Number(withdrawAmount) <= 0) {
      showMessage("Please enter a valid amount", "error");
      return;
    }
    if (Number(withdrawAmount) > Number(mpBalance)) {
      showMessage("Insufficient MarketPredict balance", "error");
      return;
    }
    try {
      setWithdrawLoading(true);

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const amountWei = ethers.parseEther(withdrawAmount);
      const tx = await contract.withdraw(amountWei);
      await tx.wait();

      showMessage("✅ Withdrawal successful!", "success");
      setWithdrawAmount("");
      await loadBalances(await signer.getAddress());
    } catch (err: any) {
      console.error("Withdrawal error:", err);

      if (isUserRejected(err)) {
        showMessage("💭 Transaction cancelled by user", "error");
      } else {
        const errorMsg = String(err?.message || "").split("\n")[0];
        showMessage(`❌ ${errorMsg || "Withdrawal failed"}`, "error");
      }
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
    const maxAmount = Math.max(0, Number(walletBalance) - 0.01);
    setDepositAmount(maxAmount.toFixed(4));
  };

  const setMaxWithdraw = () => {
    setWithdrawAmount(mpBalance);
  };

  if (!account) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 pt-20 pb-20 relative z-10">
        <div className="text-center max-w-md w-full">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-gradient-to-br from-[#00FFA3] to-[#0072FF] flex items-center justify-center shadow-[0_0_50px_rgba(0,255,163,0.5)]">
            <span className="text-5xl">👛</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#E5E5E5] mb-4">Connect Your Wallet</h1>
          <p className="text-base md:text-lg text-[#E5E5E5]/70 mb-8">
            Connect your wallet to deposit BDAG and start making predictions!
          </p>
          <button onClick={connectWallet} className="btn-glow text-base md:text-lg py-4 px-8 w-full">
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 pt-20 pb-20 relative z-10">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="hero-title text-3xl md:text-4xl mb-3 md:mb-4">Your Wallet</h1>
          <p className="text-base md:text-lg text-[#E5E5E5]/70">
            Manage your BDAG balance for predictions
          </p>
        </div>

        {/* Success/Error Message */}
        {txMessage && (
          <div
            className={`mb-6 sm:mb-8 p-4 sm:p-5 rounded-lg border text-center font-semibold text-sm md:text-base slide-in ${txType === "success"
              ? "bg-green-500/20 border-green-500 text-green-400"
              : "bg-red-500/20 border-red-500 text-red-400"
              }`}
          >
            {txMessage}
          </div>
        )}

        {/* Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
          {/* Wallet Balance */}
          <div className="bg-[#1a1d2e] p-6 sm:p-8 rounded-lg border border-[#5BA3FF]/50 shadow-[0_0_30px_rgba(91,163,255,0.2)]">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl md:text-4xl">💳</span>
              <h2 className="text-sm md:text-base text-[#E5E5E5]/70 font-semibold">Crypto Wallet Balance</h2>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-[#5BA3FF] mb-2">
              {Number(walletBalance).toFixed(4)} BDAG
            </p>
            <p className="text-xs md:text-sm text-[#E5E5E5]/50">In {walletProvider}</p>
          </div>

          {/* MarketPredict Balance */}
          <div className="bg-[#1a1d2e] p-6 sm:p-8 rounded-lg border border-[#00FFA3]/50 shadow-[0_0_30px_rgba(0,255,163,0.3)]">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl md:text-4xl">🪙</span>
              <h2 className="text-sm md:text-base text-[#E5E5E5]/70 font-semibold">MarketPredict Balance</h2>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-[#00FFA3] mb-2">
              {Number(mpBalance).toFixed(4)} BDAG
            </p>
            <p className="text-xs md:text-sm text-[#E5E5E5]/50">To set predictions</p>
          </div>

          {/* Open Predictions - REDDISH */}
          <div className="bg-[#1a1d2e] p-6 sm:p-8 rounded-lg border border-[#FF6B6B]/50 shadow-[0_0_30px_rgba(255,107,107,0.3)]">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl md:text-4xl">📈</span>
              <h2 className="text-sm md:text-base text-[#E5E5E5]/70 font-semibold">Open Predictions</h2>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-[#FF6B6B] mb-2">
              {Number(openPredictions).toFixed(4)} BDAG
            </p>
            <p className="text-xs md:text-sm text-[#E5E5E5]/50">Total unresolved predictions</p>
          </div>

          {/* Unclaimed Winnings - YELLOWISH */}
          <div className="bg-[#1a1d2e] p-6 sm:p-8 rounded-lg border border-[#FFD600]/50 shadow-[0_0_30px_rgba(255,214,0,0.3)]">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl md:text-4xl">🏆</span>
              <h2 className="text-sm md:text-base text-[#E5E5E5]/70 font-semibold">Unclaimed Winnings</h2>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-[#FFD600] mb-2">
              {Number(unclaimedWinnings).toFixed(4)} BDAG
            </p>
            <p className="text-xs md:text-sm text-[#E5E5E5]/50">Yet to claim</p>
          </div>
        </div>

        {/* Deposit Section */}
        <div className="bg-[#1a1d2e] p-6 sm:p-8 rounded-lg border border-[#00FFA3]/30 shadow-[0_0_30px_rgba(0,255,163,0.2)] mb-8 sm:mb-10">
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <span className="text-4xl md:text-5xl">💰</span>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-[#00FFA3]">Deposit BDAG</h2>
              <p className="text-xs md:text-sm text-[#E5E5E5]/60">Add funds to make predictions</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-3">
              <label className="text-base md:text-lg text-[#E5E5E5] font-semibold">Amount</label>
              <button
                onClick={setMaxDeposit}
                className="px-4 sm:px-5 py-2 sm:py-3 bg-[#00FFA3]/20 hover:bg-[#00FFA3]/30 border border-[#00FFA3]/50 rounded text-[#00FFA3] text-xs md:text-sm font-semibold transition-all"
                disabled={depositLoading}
              >
                Max ({Number(walletBalance).toFixed(4)} BDAG)
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              style={{ padding: "12px 16px", minHeight: "48px", fontSize: "16px" }}
              className="w-full bg-[#0B0C10] border-2 border-[#00FFA3] rounded-lg text-[#E5E5E5] placeholder-[#E5E5E5]/30 focus:outline-none focus:shadow-[0_0_20px_rgba(0,255,163,0.6)] transition-all md:text-lg"
              disabled={depositLoading}
            />
            <p className="text-xs md:text-sm text-[#E5E5E5]/50 mt-3">
              💡 Keep some BDAG in your wallet for gas fees
            </p>
          </div>

          <button
            onClick={handleDeposit}
            disabled={depositLoading || !depositAmount}
            className="w-full btn-glow py-4 sm:py-5 text-base md:text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
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
        <div className="bg-[#1a1d2e] p-6 sm:p-8 rounded-lg border border-[#5BA3FF]/30 shadow-[0_0_30px_rgba(91,163,255,0.2)] mb-8 sm:mb-10">
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <span className="text-4xl md:text-5xl">🏦</span>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-[#5BA3FF]">Withdraw BDAG</h2>
              <p className="text-xs md:text-sm text-[#E5E5E5]/60">Return funds to your wallet</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-3">
              <label className="text-base md:text-lg text-[#E5E5E5] font-semibold">Amount</label>
              <button
                onClick={setMaxWithdraw}
                className="px-4 sm:px-5 py-2 sm:py-3 bg-[#5BA3FF]/20 hover:bg-[#5BA3FF]/30 border border-[#5BA3FF]/50 rounded text-[#5BA3FF] text-xs md:text-sm font-semibold transition-all"
                disabled={withdrawLoading}
              >
                Max ({Number(mpBalance).toFixed(4)} BDAG)
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="0.00"
              style={{ padding: "12px 16px", minHeight: "48px", fontSize: "16px" }}
              className="w-full bg-[#0B0C10] border-2 border-[#5BA3FF] rounded-lg text-[#E5E5E5] placeholder-[#E5E5E5]/30 focus:outline-none focus:shadow-[0_0_20px_rgba(91,163,255,0.6)] transition-all md:text-lg"
              disabled={withdrawLoading}
            />
            <p className="text-xs md:text-sm text-[#E5E5E5]/50 mt-3">
              ⚡ You'll need to pay gas fees for this transaction
            </p>
          </div>

          <button
            onClick={handleWithdraw}
            disabled={withdrawLoading || !withdrawAmount || Number(mpBalance) === 0}
            className="w-full btn-glow-blue py-4 sm:py-5 text-base md:text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
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
        <div className="p-6 sm:p-8 bg-[#5BA3FF]/10 border border-[#5BA3FF]/30 rounded-lg">
          <h3 className="text-lg md:text-xl font-bold text-[#00FFA3] mb-4">💡 How It Works</h3>
          <div className="space-y-3 md:space-y-4 text-sm md:text-base text-[#E5E5E5]/80">
            <p>
              <strong className="text-[#00FFA3]">1. Deposit:</strong> Transfer BDAG from your wallet to MarketPredict. This balance is used to place predictions.
            </p>
            <p>
              <strong className="text-[#00FFA3]">2. Predict:</strong> Use your MarketPredict balance to predict YES or NO on markets.
            </p>
            <p>
              <strong className="text-[#00FFA3]">3. Withdraw:</strong> Anytime you want, move your funds back to your wallet.
            </p>
            <p className="pt-3 md:pt-4 border-t border-[#E5E5E5]/10">
              🔒 <strong>Security:</strong> Your funds are always under your control. We will never ask for your private key or seed phrase.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}