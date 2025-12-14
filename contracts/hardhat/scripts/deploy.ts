import { ethers } from "hardhat";

async function main() {
  const MarketPredict = await ethers.getContractFactory("MarketPredict");
  const contract = await MarketPredict.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("MarketPredict deployed to:", contractAddress);

  // Initialize the contract
  console.log("Initializing contract...");
  const initTx = await contract.initialize();
  await initTx.wait();
  console.log("Contract initialized");

  // Transfer ownership to deployer
  const [deployer] = await ethers.getSigners();
  const ownerAddress = await deployer.getAddress();
  console.log("Transferring ownership to:", ownerAddress);
  const ownerTx = await contract.transferOwnership(ownerAddress);
  await ownerTx.wait();
  console.log("Ownership transferred");

  // Verify final owner
  const owner = await contract.owner();
  console.log("Final owner:", owner);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});