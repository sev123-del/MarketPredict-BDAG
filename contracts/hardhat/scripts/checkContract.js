// Quick script to check if contract exists
const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const contractAddress = process.env.CONTRACT_ADDRESS;
  
  console.log("Checking contract at:", contractAddress);
  console.log("RPC:", process.env.RPC_URL);
  
  try {
    const code = await provider.getCode(contractAddress);
    
    if (code === "0x") {
      console.log("❌ NO CONTRACT FOUND - Address has no bytecode");
      console.log("This means either:");
      console.log("  1. Contract was never deployed to this address");
      console.log("  2. Wrong network/RPC");
      console.log("  3. RPC is having issues");
    } else {
      console.log("✅ CONTRACT EXISTS");
      console.log("Bytecode length:", code.length, "characters");
      
      // Try calling nextMarketId
      const abi = ["function nextMarketId() view returns (uint256)"];
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const count = await contract.nextMarketId();
      console.log("✅ nextMarketId() call successful:", count.toString());
    }
  } catch (error) {
    console.log("⚠️ ERROR:", error.message);
  }
}

main();
