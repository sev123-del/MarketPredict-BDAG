import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { MarketPredict, MarketPredictV2 } from "../typechain-types";

describe("MarketPredict (transparent proxy upgrades)", function () {
  it("deploys via proxy, disables impl initializers, and upgrades", async function () {
    const [deployer] = await ethers.getSigners();

    const Market = await ethers.getContractFactory("MarketPredict");
    const proxy = (await upgrades.deployProxy(Market, [], {
      initializer: "initialize",
      kind: "transparent",
    })) as unknown as MarketPredict;
    await proxy.waitForDeployment();

    expect(await proxy.owner()).to.equal(await deployer.getAddress());

    await proxy.createMarket("Q", "D", "C", 60, 0, ethers.ZeroAddress, 0);
    expect(await proxy.nextId()).to.equal(1n);

    const proxyAddress = await proxy.getAddress();
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    // The implementation must not be initializable.
    const impl = Market.attach(implAddress);
    await expect(impl.initialize()).to.be.reverted;

    const MarketV2 = await ethers.getContractFactory("MarketPredictV2");
    const upgraded = (await upgrades.upgradeProxy(proxyAddress, MarketV2)) as unknown as MarketPredictV2;

    expect(await upgraded.version()).to.equal("v2");
    expect(await upgraded.nextId()).to.equal(1n);
    expect(await upgraded.owner()).to.equal(await deployer.getAddress());
  });
});
