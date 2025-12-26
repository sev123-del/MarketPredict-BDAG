// Moved inline wallet connection helper here so CSP nonces can be used
async function connectWallet() {
    if (typeof window.ethereum !== "undefined") {
        try {
            await window.ethereum.request({ method: "eth_requestAccounts" });
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();
            alert("Connected wallet: " + address);
        } catch (error) {
            alert("Connection failed: " + (error && error.message ? error.message : error));
        }
    } else {
        alert("No wallet detected — please install MetaMask or BDAG Wallet!");
    }
}

// Expose for inline `onclick` attributes
window.connectWallet = connectWallet;
