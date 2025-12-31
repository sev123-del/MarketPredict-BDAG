"use client";
import React, { useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../configs/contractConfig";

export default function MarketPredictor({ marketId }) {
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState("yes");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("error");

  const showNotice = (message, type = "error") => {
    setNotice(message);
    setNoticeType(type);
    setTimeout(() => setNotice(""), 6000);
  };

  const handlePredict = async () => {
    try {
      if (!window.ethereum) {
        showNotice("No wallet detected. Connect a wallet to continue.", "error");
        return;
      }
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        showNotice("Enter a valid BDAG amount", "error");
        return;
      }

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
      showNotice(`Prediction placed: ${side.toUpperCase()} for ${amount} BDAG`, "success");
      setAmount("");
    } catch (err) {
      console.error("Error placing prediction:", err);
      showNotice("Transaction failed. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: "0.5rem" }}>
      {notice && (
        <div
          style={{
            marginBottom: "0.5rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "10px",
            border: "1px solid #ccc",
            background: noticeType === "error" ? "#fee2e2" : "#dcfce7",
            color: noticeType === "error" ? "#b91c1c" : "#166534",
            fontWeight: 600,
          }}
        >
          {notice}
        </div>
      )}
      <input
        name="predict-amount"
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
        name="predict-side"
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
