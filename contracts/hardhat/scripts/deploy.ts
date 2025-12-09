import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying MarketPredict contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const MarketPredict = await ethers.getContractFactory("MarketPredict");
  const contract = await MarketPredict.deploy();

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`✅ Deployed MarketPredict at: ${address}`);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
