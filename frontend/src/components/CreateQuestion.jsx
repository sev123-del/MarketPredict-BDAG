import React, { useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig.js";

export default function CreateQuestion({ onMarketCreated }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("error");

  const showNotice = (message, type = "error") => {
    setNotice(message);
    setNoticeType(type);
    setTimeout(() => setNotice(""), 6000);
  };

  const handleCreate = async () => {
    if (!question.trim()) {
      showNotice("Enter a valid question.", "error");
      return;
    }
    setLoading(true);
    try {
      if (!window?.ethereum) {
        showNotice("No wallet detected. Connect a wallet to continue.", "error");
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createMarket(question);
      await tx.wait();
      setQuestion("");
      if (onMarketCreated) onMarketCreated(); // ✅ trigger refresh
      showNotice("Market created successfully!", "success");
    } catch (err) {
      console.error("Create error:", err);
      showNotice("Failed to create market.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 bg-gray-900 p-6 rounded-2xl shadow-lg mt-8">
      <h2 className="text-xl font-orbitron text-primary">Create New Market</h2>
      {notice && (
        <div className={`w-full max-w-[20rem] text-sm px-3 py-2 rounded-lg border ${noticeType === 'error' ? 'border-orange-500/40 bg-orange-500/10 text-orange-200' : 'border-green-500/40 bg-green-500/10 text-green-200'}`}>
          {notice}
        </div>
      )}
      <input
        name="create-question"
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
