// frontend/src/WalletConnect.js
import React, { useState } from "react";
import { ethers } from "ethers";

export default function WalletConnect() {
  const [address, setAddress] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("error");

  const showNotice = (message, type = "error") => {
    setNotice(message);
    setNoticeType(type);
    setTimeout(() => setNotice(""), 6000);
  };

  async function connectWallet() {
    if (typeof window.ethereum !== "undefined") {
      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();
        setAddress(addr);
        showNotice("Wallet connected.", "success");
      } catch (error) {
        const msg = (error && error.message) ? String(error.message) : "Connection failed";
        showNotice(`Connection failed: ${msg}`, "error");
      }
    } else {
      showNotice("No wallet detected. Install MetaMask (or a compatible wallet) to continue.", "error");
    }
  }

  return (
    <div style={{ textAlign: "center", marginTop: "80px", fontFamily: "sans-serif" }}>
      <h2>MarketPredict Wallet Connect</h2>
      {notice && (
        <div
          style={{
            maxWidth: 520,
            margin: "16px auto",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: noticeType === "error" ? "#fee2e2" : "#dcfce7",
            color: noticeType === "error" ? "#b91c1c" : "#166534",
            fontWeight: 600,
          }}
        >
          {notice}
        </div>
      )}
      <button
        onClick={connectWallet}
        style={{
          padding: "10px 20px",
          fontSize: "16px",
          backgroundColor: "#004aad",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        Connect Wallet
      </button>
      {address && (
        <p style={{ marginTop: "20px", color: "green" }}>
          ✅ Connected: {address}
        </p>
      )}
    </div>
  );
}
