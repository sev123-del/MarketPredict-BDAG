import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { ChainlinkMockV3Aggregator, MarketPredict } from "../typechain-types";

describe("MarketPredict (oracle resolution)", function () {
  let market: MarketPredict;
  let feed8: ChainlinkMockV3Aggregator;

  beforeEach(async function () {
    const Feed = await ethers.getContractFactory("ChainlinkMockV3Aggregator");
    feed8 = await Feed.deploy(8, 100n * 10n ** 8n);
    await feed8.waitForDeployment();

    const Market = await ethers.getContractFactory("MarketPredict");
    market = (await upgrades.deployProxy(Market, [], {
      initializer: "initialize",
      kind: "transparent",
    })) as unknown as MarketPredict;
    await market.waitForDeployment();
  });

  it("scales feed decimals to 18 before compare", async function () {
    // target 101.00 (18 decimals)
    const target = 101n * 10n ** 18n;
    await market.createMarket(
      "BTC >= 101?",
      "desc",
      "cat",
      60,
      1, // ORACLE
      await feed8.getAddress(),
      target
    );

    await ethers.provider.send("evm_increaseTime", [70]);
    await ethers.provider.send("evm_mine", []);

    await market.resolveWithOracle(0);
    const m = await market.markets(0);
    expect(m.outcome).to.equal(false);
  });

  it("reverts if price is stale", async function () {
    const target = 1n * 10n ** 18n;
    await market.createMarket(
      "stale check",
      "desc",
      "cat",
      60,
      1,
      await feed8.getAddress(),
      target
    );

    // let oracle update be >1h old by the time we resolve
    await ethers.provider.send("evm_increaseTime", [60 + 3700]);
    await ethers.provider.send("evm_mine", []);

    await expect(market.resolveWithOracle(0)).to.be.revertedWith("Price stale");
  });
});
