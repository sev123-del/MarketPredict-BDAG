"use client";
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig.js";
import { parseQuestion } from "../utils/aiQuestionParser";

export default function CreateQuestionHybrid({ onMarketCreated }) {
  const [isClient, setIsClient] = useState(false);
  const [mode, setMode] = useState("guided");
  const [category, setCategory] = useState("crypto");
  const [asset, setAsset] = useState("BDAG");
  const [condition, setCondition] = useState("greater than");
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [customText, setCustomText] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => setIsClient(true), []);
  if (!isClient) return null;

  const buildPreview = () => {
    if (mode === "guided") {
      if (!value || !date) return "";
      return `Will ${asset} be ${condition} $${value} by ${date}?`;
    }
    return preview;
  };

  const handleParse = async () => {
    if (!customText.trim()) return;
    try {
      const res = await fetch("/api/parse-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: customText }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setPreview(data.normalized);
    } catch (err) {
      setError("AI parsing unavailable. Try guided mode.");
    }
  };

  const checkExistingMarket = async (question) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const nextId = await contract.nextMarketId();

      for (let i = 0; i < Number(nextId); i++) {
        const market = await contract.markets(i);
        if (market.question.trim().toLowerCase() === question.trim().toLowerCase()) {
          return i;
        }
      }
    } catch (err) {
      console.error("Error checking duplicates:", err);
    }
    return null;
  };

  const handleCreate = async () => {
    const q = buildPreview();
    if (!q) return alert("Please complete all fields or fix errors.");
    setLoading(true);
    try {
      const existing = await checkExistingMarket(q);
      if (existing !== null) {
        alert(`⚠️ This question already exists! View it on Market ID #${existing}.`);
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createMarket(q);
      await tx.wait();

      alert("✅ Market created!");
      setValue("");
      setDate("");
      setCustomText("");
      setPreview("");
      if (onMarketCreated) onMarketCreated();
    } catch (err) {
      console.error(err);
      alert("Error creating market");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 p-6 rounded-2xl shadow-lg text-center w-[90%] md:w-[70%] mx-auto mt-10">
      <h2 className="text-xl font-orbitron text-primary mb-4">
        Create a Prediction Market
      </h2>

      <div className="flex justify-center mb-4">
        <button
          className={`px-4 py-2 mx-2 rounded-lg ${
            mode === "guided" ? "bg-primary text-black" : "bg-gray-700"
          }`}
          onClick={() => setMode("guided")}
        >
          Guided Mode
        </button>
        <button
          className={`px-4 py-2 mx-2 rounded-lg ${
            mode === "text" ? "bg-primary text-black" : "bg-gray-700"
          }`}
          onClick={() => setMode("text")}
        >
          Text Mode (AI)
        </button>
      </div>

      {mode === "guided" ? (
        <div className="flex flex-col items-center gap-4">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="p-2 rounded-md text-black w-60"
          >
            <option value="crypto">Crypto</option>
            <option value="sports">Sports</option>
            <option value="weather">Weather</option>
          </select>

          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="p-2 rounded-md text-black w-60"
          >
            <option value="BDAG">BDAG</option>
            <option value="Ethereum">Ethereum</option>
            <option value="Bitcoin">Bitcoin</option>
          </select>

          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="p-2 rounded-md text-black w-60"
          >
            <option value="greater than">greater than</option>
            <option value="less than">less than</option>
            <option value="equal to">equal to</option>
          </select>

          <input
            type="number"
            placeholder="Value (USD)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="p-2 rounded-md text-black w-60"
          />

          <input
            type="date"
            value={date}
            min={new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0]}
            onChange={(e) => setDate(e.target.value)}
            className="p-2 rounded-md text-black w-60"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <input
            type="text"
            placeholder='Ex: "Will Ethereum reach $5000 by Jan 2026?"'
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onBlur={handleParse}
            className="w-80 p-2 rounded-md text-black"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      )}

      <div className="mt-6 text-gray-300">
        <p>
          📜 <strong>Preview:</strong>{" "}
          {buildPreview() || "Your question will appear here..."}
        </p>
      </div>

      <button
        onClick={handleCreate}
        disabled={loading}
        className="mt-6 bg-primary px-5 py-2 rounded-lg text-black hover:scale-105 transition-transform"
      >
        {loading ? "Submitting..." : "Create Market"}
      </button>
    </div>
  );
}
