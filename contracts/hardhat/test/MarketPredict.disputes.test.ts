import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { MarketPredict } from "../typechain-types";

describe("MarketPredict (disputes + creator pause/edit)", function () {
  let market: MarketPredict;

  beforeEach(async function () {
    const Market = await ethers.getContractFactory("MarketPredict");
    market = (await upgrades.deployProxy(Market, [], {
      initializer: "initialize",
      kind: "transparent",
    })) as unknown as MarketPredict;
    await market.waitForDeployment();
  });

  it("allows only one dispute per market with a bond (ended but unresolved)", async function () {
    const [owner, userA, userB] = await ethers.getSigners();

    // Owner creates a market
    await market.createMarket("Q", "D", "C", 60, 0, ethers.ZeroAddress, 0);

    // Users deposit and take positions
    await market.connect(userA).deposit({ value: ethers.parseEther("1") });
    await market.connect(userB).deposit({ value: ethers.parseEther("1") });

    await market.connect(userA).predict(0, true, ethers.parseEther("0.2"));
    await market.connect(userB).predict(0, false, ethers.parseEther("0.2"));

    // Market ends (but is not resolved yet)
    await ethers.provider.send("evm_increaseTime", [70]);
    await ethers.provider.send("evm_mine", []);

    const bondWei = await market.disputeBondWei();
    const balBefore = await market.balances(await userA.getAddress());

    // User A opens the one-and-only dispute
    await expect((market as unknown as any).connect(userA).openDispute(0, "bad market"))
      .to.emit(market, "DisputeOpened")
      .withArgs(0, await userA.getAddress(), "bad market");

    const balAfter = await market.balances(await userA.getAddress());
    expect(balBefore - balAfter).to.equal(bondWei);

    const admin = await (market as unknown as any).getMarketAdmin(0);
    expect(admin.paused).to.equal(true);
    expect(admin.disputeUsed).to.equal(true);
    expect(admin.disputeActive).to.equal(true);

    // Second dispute is blocked (even by a different user)
    await expect((market as unknown as any).connect(userB).openDispute(0, "another"))
      .to.be.revertedWith("Dispute already used");

    // Reject dispute: bond becomes fees and market unpauses
    const feesBefore = await market.collectedFees();
    await expect((market as unknown as any).connect(owner).resolveDispute(0, await userA.getAddress(), false))
      .to.emit(market, "DisputeResolved")
      .withArgs(0, await userA.getAddress(), false);

    const feesAfter = await market.collectedFees();
    expect(feesAfter - feesBefore).to.equal(bondWei);

    const adminAfter = await (market as unknown as any).getMarketAdmin(0);
    expect(adminAfter.disputeActive).to.equal(false);
    expect(adminAfter.disputeUsed).to.equal(true);
    expect(adminAfter.paused).to.equal(false);

    // Still cannot dispute again
    await expect((market as unknown as any).connect(userA).openDispute(0, "retry"))
      .to.be.revertedWith("Dispute already used");
  });

  it("blocks disputes after the post-close dispute window", async function () {
    const [user] = await ethers.getSigners();

    await market.createMarket("Q", "D", "C", 60, 0, ethers.ZeroAddress, 0);

    await market.deposit({ value: ethers.parseEther("1") });
    await market.predict(0, true, ethers.parseEther("0.2"));

    // Move to after endTime + 2 hours
    await ethers.provider.send("evm_increaseTime", [60 + 2 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    await expect((market as unknown as any).connect(user).openDispute(0, "too late"))
      .to.be.revertedWith("Dispute window closed");
  });

  it("creator can pause and edit metadata only before any bets", async function () {
    const [owner] = await ethers.getSigners();

    await market.createMarket("Q", "D", "C", 60, 0, ethers.ZeroAddress, 0);

    await expect((market as unknown as any).setMarketPause(0, true))
      .to.emit(market, "MarketPaused")
      .withArgs(0, true);

    await expect((market as unknown as any).editMarket(0, "Q2", "D2", "C2"))
      .to.emit(market, "MarketEdited")
      .withArgs(0);

    const basics = await market.getMarketBasics(0);
    expect(basics.question).to.equal("Q2");
    expect(basics.description).to.equal("D2");
    expect(basics.category).to.equal("C2");

    // Unpause for normal betting flow
    await (market as unknown as any).setMarketPause(0, false);

    // Place a bet, edits should be blocked
    await market.deposit({ value: ethers.parseEther("1") });
    await market.predict(0, true, ethers.parseEther("0.2"));

    await expect((market as unknown as any).editMarket(0, "Q3", "", ""))
      .to.be.revertedWith("Market has bets");
  });
});
