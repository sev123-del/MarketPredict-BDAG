import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import logger from "../lib/logger";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig.js";

export default function MarketList({ refreshTrigger }) {
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    loadMarkets();
  }, [refreshTrigger]);

  const loadMarkets = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const nextId = await contract.nextMarketId();
      const list = [];

      for (let i = 0; i < Number(nextId); i++) {
        const market = await contract.markets(i);
        list.push({
          id: i,
          question: market.question,
          resolved: market.resolved,
          outcomeYes: market.outcomeYes,
        });
      }
      setMarkets(list);
    } catch (err) {
      logger.error('Load markets error:', err);
    }
  };

  return (
    <div className="mt-10 flex flex-col items-center gap-4">
      <h2 className="text-2xl font-orbitron text-primary">Active Markets</h2>
      {markets.map((m) => (
        <div
          key={m.id}
          className="w-3/4 bg-gray-800 p-4 rounded-xl shadow-md border border-gray-700"
        >
          <p className="text-lg">{m.question}</p>
          <p className="text-sm text-gray-400">
            Status: {m.resolved ? (m.outcomeYes ? "✅ YES" : "❌ NO") : "🕒 Open"}
          </p>
        </div>
      ))}
      {markets.length === 0 && (
        <p className="text-gray-400">No markets yet. Create one above!</p>
      )}
    </div>
  );
}
