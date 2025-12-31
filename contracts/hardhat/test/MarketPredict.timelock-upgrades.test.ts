import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { MarketPredictV2 } from "../typechain-types";

describe("MarketPredict (timelocked upgrades)", function () {
    it("blocks direct ProxyAdmin upgrades and allows timelock upgrade", async function () {
        const [deployer, proposer] = await ethers.getSigners();

        const getEip1967AdminAddress = async (proxyAddress: string): Promise<string> => {
            // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
            const adminSlot =
                "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
            const raw = await ethers.provider.getStorage(proxyAddress, adminSlot);
            const addr = ("0x" + raw.slice(-40)) as string;
            return ethers.getAddress(addr);
        };

        const Market = await ethers.getContractFactory("MarketPredict");
        const proxy = await upgrades.deployProxy(Market, [], {
            initializer: "initialize",
            kind: "transparent",
        });
        await proxy.waitForDeployment();

        const proxyAddress = await proxy.getAddress();
        const proxyAdminAddress = await getEip1967AdminAddress(proxyAddress);
        expect(proxyAdminAddress).to.be.properAddress;

        const Timelock = await ethers.getContractFactory("MP_TimelockController");
        const minDelay = 60; // seconds

        // Make proposer able to schedule; allow anyone to execute by granting executor to address(0).
        const timelock = await Timelock.deploy(
            minDelay,
            [await proposer.getAddress()],
            [ethers.ZeroAddress],
            await deployer.getAddress()
        );
        await timelock.waitForDeployment();

        // Transfer ProxyAdmin ownership to timelock.
        // (Avoid upgrades.admin helpers here; they differ across plugin versions.)
        const timelockAddress = await timelock.getAddress();
        const proxyAdminOwnableIface = new ethers.Interface([
            "function owner() view returns (address)",
            "function transferOwnership(address newOwner) external",
        ]);
        const proxyAdminOwnable = new ethers.Contract(
            proxyAdminAddress,
            proxyAdminOwnableIface,
            deployer
        );
        await proxyAdminOwnable.transferOwnership(timelockAddress);

        // Prepare new implementation (V2).
        const MarketV2Factory = await ethers.getContractFactory("MarketPredictV2");
        const newImpl = await upgrades.prepareUpgrade(proxyAddress, MarketV2Factory);

        // Deployer should NOT be able to upgrade now.
        const proxyAdminIface = new ethers.Interface([
            "function upgradeAndCall(address proxy, address implementation, bytes data) external payable",
        ]);
        const proxyAdmin = new ethers.Contract(
            proxyAdminAddress,
            proxyAdminIface,
            deployer
        );

        await expect(
            proxyAdmin.upgradeAndCall(proxyAddress, newImpl, "0x")
        ).to.be.reverted;

        // Timelock schedules the upgrade.
        const upgradeCalldata = proxyAdminIface.encodeFunctionData("upgradeAndCall", [
            proxyAddress,
            newImpl,
            "0x",
        ]);

        const predecessor = ethers.ZeroHash;
        const salt = ethers.id("MP_UPGRADE_TEST");

        const timelockIface = new ethers.Interface([
            "function schedule(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt,uint256 delay) external",
            "function execute(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt) external payable",
        ]);

        const timelockAsProposer = new ethers.Contract(
            timelockAddress,
            timelockIface,
            proposer
        );

        await timelockAsProposer.schedule(
            proxyAdminAddress,
            0,
            upgradeCalldata,
            predecessor,
            salt,
            minDelay
        );

        await time.increase(minDelay + 1);

        // Anyone can execute because executor includes address(0).
        const timelockAsExecutor = new ethers.Contract(
            timelockAddress,
            timelockIface,
            deployer
        );

        await timelockAsExecutor.execute(
            proxyAdminAddress,
            0,
            upgradeCalldata,
            predecessor,
            salt
        );

        // Verify the new logic is live.
        const upgraded = (await ethers.getContractAt(
            "MarketPredictV2",
            proxyAddress
        )) as unknown as MarketPredictV2;

        expect(await upgraded.version()).to.equal("v2");
    });
});
