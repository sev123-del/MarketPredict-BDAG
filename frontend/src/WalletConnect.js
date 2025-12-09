// frontend/src/WalletConnect.js
import React, { useState } from "react";
import { ethers } from "ethers";

export default function WalletConnect() {
  const [address, setAddress] = useState("");

  async function connectWallet() {
    if (typeof window.ethereum !== "undefined") {
      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();
        setAddress(addr);
      } catch (error) {
        alert("Connection failed: " + error.message);
      }
    } else {
      alert("No wallet detected — please install MetaMask, OKX, or BDAG Wallet!");
    }
  }

  return (
    <div style={{ textAlign: "center", marginTop: "80px", fontFamily: "sans-serif" }}>
      <h2>MarketPredict Wallet Connect</h2>
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
