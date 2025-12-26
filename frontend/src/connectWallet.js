import { ethers } from "ethers";

export async function connectWallet() {
  if (typeof window.ethereum !== "undefined") {
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      (await import('./lib/logger')).then(({ debug }) => debug('Connected wallet:', address));
      return address;
    } catch (err) {
      (await import('./lib/logger')).then((mod) => mod.error('Connection error:', err));
      alert("Wallet connection failed!");
    }
  } else {
    alert("No BDAG-compatible wallet found.");
  }
}
