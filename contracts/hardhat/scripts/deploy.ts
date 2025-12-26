import { ethers, upgrades } from "hardhat";

async function main() {
  const MarketPredict = await ethers.getContractFactory("MarketPredict");

  const proxy = await upgrades.deployProxy(MarketPredict, [], {
    initializer: "initialize",
    kind: "transparent",
  });
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  console.log("MarketPredict (proxy) deployed to:", proxyAddress);

  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
  console.log("Implementation:", implementationAddress);
  console.log("ProxyAdmin:", adminAddress);

  const owner = await proxy.owner();
  console.log("Owner:", owner);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});