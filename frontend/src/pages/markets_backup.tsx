/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

export default function MarketOverview() {
    const [provider, setProvider] = useState<any>(null);
    const [signer, setSigner] = useState<any>(null);
    const [walletAddress, setWalletAddress] = useState<string>("");
    const [markets, setMarkets] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [showMore, setShowMore] = useState(false);
    const [notice, setNotice] = useState<string>("");

    const showNotice = useCallback((message: string) => {
        setNotice(message);
        setTimeout(() => setNotice(""), 6000);
    }, []);


    const loadMarkets = useCallback(async (prov: any) => {
        try {
            setLoading(true);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, prov);

            // Check if contract exists
            const code = await prov.getCode(CONTRACT_ADDRESS);
            if (code === '0x') {
                showNotice(`Contract not found at ${CONTRACT_ADDRESS}. Make sure you're on the correct network.`);
                setLoading(false);
                return;
            }

            const count = await contract.nextMarketId();
            const fetched: any[] = [];

            for (let i = 0; i < count; i++) {
                try {
                    const market = await contract.markets(i);
                    fetched.push({
                        id: i,
                        question: market.question,
                        yesPool: Number(ethers.formatEther(market.yesPool)),
                        noPool: Number(ethers.formatEther(market.noPool)),
                        closeTime: market.closeTime,
                        resolved: market.resolved,
                        outcomeYes: market.outcomeYes,
                    });
                } catch {
                    console.warn(`Market ${i} not accessible`);
                }
            }

            setMarkets(fetched);
            setLoading(false);
        } catch (err: any) {
            console.error("Error loading markets:", err);
            showNotice(`Failed to load markets: ${err.message || 'Unknown error'}. Check your network connection.`);
            setLoading(false);
        }
    }, [showNotice]);

    const connectWallet = useCallback(async () => {
        if (!window.ethereum) {
            showNotice("No wallet detected. Install MetaMask (or a compatible wallet) to continue.");
            return;
        }
        const prov = new ethers.BrowserProvider(window.ethereum as any);
        const sign = await prov.getSigner();
        const addr = await sign.getAddress();
        setProvider(prov);
        setSigner(sign);
        setWalletAddress(addr);
        await loadMarkets(prov);
    }, [loadMarkets, showNotice]);

    // legacy: intentionally call connectWallet once on mount; connectWallet is stable
    useEffect(() => {
        connectWallet();
    }, [connectWallet]);

    const placePrediction = async (marketId: number, side: boolean) => {
        if (!signer) {
            showNotice("Connect wallet first.");
            return;
        }
        try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            const tx = await contract.placePrediction(
                marketId,
                side,
                ethers.parseEther("0.01")
            );
            await tx.wait();
            showNotice("Prediction placed successfully!");
            loadMarkets(provider);
        } catch (err) {
            console.error("Prediction failed:", err);
            showNotice("Transaction failed. Please try again.");
        }
    };

    return (
        <main className="min-h-screen flex flex-col items-center text-center px-4 relative z-10">
            <h1 className="hero-title mt-20">Markets Overview</h1>

            {notice && (
                <div className="w-full max-w-2xl mb-6 p-3 rounded-lg border border-orange-500/40 bg-orange-500/10 text-orange-200 text-sm">
                    {notice}
                </div>
            )}
            <p className="hero-subtitle mb-10">
                Connected:{" "}
                <span className="date-text">
                    {walletAddress
                        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                        : "Not connected"}
                </span>
            </p>

            {/* Featured Section */}
            <section className="mt-10 mb-16 w-full max-w-6xl">
                <h2 className="text-2xl font-bold mb-6">🌟 Featured Questions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {markets
                        .filter((m) =>
                            ["Crypto Prices", "Entertainment", "Weather"].some((cat) =>
                                m.question.startsWith(`(${cat})`)
                            )
                        )
                        .slice(0, 3)
                        .map((m: any) => (
                            <div key={m.id} className="market-box turquoise">
                                <h3 className="text-lg font-bold mb-2">{m.question}</h3>
                                <p className="text-sm text-gray-400 mb-2">
                                    Closes:{" "}
                                    <span className="date-text">
                                        {new Date(Number(m.closeTime) * 1000).toLocaleString()}
                                    </span>
                                </p>
                                <p className="text-sm mb-2">
                                    {m.resolved
                                        ? `✅ Resolved (Outcome: ${m.outcomeYes ? "YES" : "NO"})`
                                        : "🕓 Open"}
                                </p>
                                {!m.resolved && (
                                    <div className="flex flex-wrap justify-center gap-6 mt-4">
                                        <button
                                            onClick={() => placePrediction(m.id, true)}
                                            className="btn-glow"
                                        >
                                            Bet YES
                                        </button>
                                        <button
                                            onClick={() => placePrediction(m.id, false)}
                                            className="btn-glow-red"
                                        >
                                            Bet NO
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                </div>
            </section>

            {/* Category Section */}
            <section className="z-10 w-full max-w-6xl">
                <h2 className="text-2xl font-bold mb-6">📂 Categories</h2>

                <div className="flex flex-wrap justify-center gap-4 mb-6">
                    {[
                        "Crypto Prices",
                        "Entertainment",
                        "Weather",
                        "Science",
                        "Technology",
                        "World Events",
                    ].map((cat, i) => (
                        <button
                            key={i}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-4 py-2 rounded-full border ${activeCategory === cat
                                ? "bg-turquoise text-black font-semibold"
                                : "border-gray-600 text-gray-300 hover:bg-gray-800"
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {showMore && (
                    <div className="flex flex-wrap justify-center gap-4 mb-6">
                        {[
                            "Space",
                            "Climate",
                            "Economy",
                            "Celebrities",
                        ].map((cat, i) => (
                            <button
                                key={`more-${i}`}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-4 py-2 rounded-full border ${activeCategory === cat
                                    ? "bg-turquoise text-black font-semibold"
                                    : "border-gray-600 text-gray-300 hover:bg-gray-800"
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}

                <button
                    onClick={() => setShowMore(!showMore)}
                    className="text-turquoise text-sm underline mb-8"
                >
                    {showMore ? "Show Less" : "Show More"}
                </button>

                <div className="flex flex-col gap-8">
                    {markets
                        .filter((m) =>
                            activeCategory
                                ? m.question.startsWith(`(${activeCategory})`)
                                : true
                        )
                        .map((m: any) => (
                            <div key={m.id} className="market-box turquoise">
                                <h3 className="text-lg font-bold mb-2">{m.question}</h3>
                                <p className="text-sm text-gray-400 mb-2">
                                    Closes:{" "}
                                    <span className="date-text">
                                        {new Date(Number(m.closeTime) * 1000).toLocaleString()}
                                    </span>
                                </p>
                                <p className="text-sm mb-2">
                                    {m.resolved
                                        ? `✅ Resolved (Outcome: ${m.outcomeYes ? "YES" : "NO"})`
                                        : "🕓 Open"}
                                </p>
                                {!m.resolved && (
                                    <div className="flex flex-wrap justify-center gap-6 mt-4">
                                        <button
                                            onClick={() => placePrediction(m.id, true)}
                                            className="btn-glow"
                                        >
                                            Bet YES
                                        </button>
                                        <button
                                            onClick={() => placePrediction(m.id, false)}
                                            className="btn-glow-red"
                                        >
                                            Bet NO
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                </div>
            </section>
        </main>
    );
}
