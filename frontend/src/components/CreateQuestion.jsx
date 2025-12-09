import React, { useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig.js";

export default function CreateQuestion({ onMarketCreated }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!question.trim()) return alert("Enter a valid question.");
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createMarket(question);
      await tx.wait();
      setQuestion("");
      if (onMarketCreated) onMarketCreated(); // ✅ trigger refresh
      alert("Market created successfully!");
    } catch (err) {
      console.error("Create error:", err);
      alert("Failed to create market.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 bg-gray-900 p-6 rounded-2xl shadow-lg mt-8">
      <h2 className="text-xl font-orbitron text-primary">Create New Market</h2>
      <input
        type="text"
        placeholder="Enter your prediction question..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="w-80 p-2 rounded-md text-black"
      />
      <button onClick={handleCreate} disabled={loading}>
        {loading ? "Creating..." : "Create Market"}
      </button>
    </div>
  );
}
