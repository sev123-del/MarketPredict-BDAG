import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { MarketPredict } from "../typechain-types";

describe("MarketPredict (market writers)", function () {
    let market: MarketPredict;

    beforeEach(async function () {
        const Market = await ethers.getContractFactory("MarketPredict");
        market = (await upgrades.deployProxy(Market, [], {
            initializer: "initialize",
            kind: "transparent",
        })) as unknown as MarketPredict;
        await market.waitForDeployment();
    });

    it("owner can add/remove writers; writer can create markets", async function () {
        const [owner, writer, stranger] = await ethers.getSigners();

        // writer cannot create by default
        await expect(
            market.connect(writer).createMarket("Q", "D", "C", 60, 0, ethers.ZeroAddress, 0)
        ).to.be.revertedWith("Not authorized");

        // owner grants writer
        await market.connect(owner).setMarketWriter(await writer.getAddress(), true);
        expect(await market.marketWriters(await writer.getAddress())).to.equal(true);

        // writer can now create
        await market.connect(writer).createMarket("Q2", "D2", "C2", 60, 0, ethers.ZeroAddress, 0);
        expect(await market.marketCount()).to.equal(1n);

        // stranger still cannot
        await expect(
            market.connect(stranger).createMarket("Q3", "D3", "C3", 60, 0, ethers.ZeroAddress, 0)
        ).to.be.revertedWith("Not authorized");

        // owner removes writer
        await market.connect(owner).setMarketWriter(await writer.getAddress(), false);
        expect(await market.marketWriters(await writer.getAddress())).to.equal(false);

        await expect(
            market.connect(writer).createMarket("Q4", "D4", "C4", 60, 0, ethers.ZeroAddress, 0)
        ).to.be.revertedWith("Not authorized");
    });
});
