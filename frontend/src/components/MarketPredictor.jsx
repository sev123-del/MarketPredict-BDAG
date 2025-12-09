"use client";
import React, { useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

export default function MarketPredictor({ marketId }) {
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState("yes");
  const [loading, setLoading] = useState(false);

  const handlePredict = async () => {
    try {
      if (!window.ethereum) return alert("Wallet not detected");
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
        return alert("Enter a valid BDAG amount");

      setLoading(true);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.placePrediction(
        marketId,
        side === "yes",
        { value: ethers.parseEther(amount) }
      );

      await tx.wait();
      alert(`Prediction placed: ${side.toUpperCase()} for ${amount} BDAG`);
      setAmount("");
    } catch (err) {
      console.error("Error placing prediction:", err);
      alert("Transaction failed. See console for details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <input
        type="number"
        placeholder="Amount (BDAG)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{
          padding: "0.4rem",
          borderRadius: "6px",
          border: "1px solid #ccc",
          marginRight: "0.5rem",
          width: "120px"
        }}
      />

      <select
        value={side}
        onChange={(e) => setSide(e.target.value)}
        style={{ padding: "0.4rem", borderRadius: "6px", marginRight: "0.5rem" }}
      >
        <option value="yes">YES</option>
        <option value="no">NO</option>
      </select>

      <button
        disabled={loading}
        onClick={handlePredict}
        style={{
          padding: "0.5rem 1rem",
          borderRadius: "6px",
          border: "none",
          backgroundColor: loading ? "#999" : "#0070f3",
          color: "white",
          cursor: "pointer"
        }}
      >
        {loading ? "Processing..." : "Predict"}
      </button>
    </div>
  );
}
