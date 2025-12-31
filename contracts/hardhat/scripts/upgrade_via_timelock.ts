import { ethers, upgrades } from "hardhat";
import { getEip1967AdminAddress } from "./_eip1967";

function mustGetEnv(name: string): string {
    const v = process.env[name];
    if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
    return v.trim();
}

function mustGetEnvNumber(name: string): number {
    const raw = mustGetEnv(name);
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
    return n;
}

async function main() {
    const proxyAddress = mustGetEnv("PROXY_ADDRESS");
    const timelockAddress = mustGetEnv("TIMELOCK_ADDRESS");

    // Optional: override if you already know the ProxyAdmin address
    const proxyAdminAddress = (process.env.PROXY_ADMIN_ADDRESS || "").trim();

    // Timelock schedule/execute params
    const salt = (process.env.SALT || ethers.id("MP_UPGRADE")).trim();
    const delaySeconds = process.env.DELAY_SECONDS
        ? mustGetEnvNumber("DELAY_SECONDS")
        : undefined;

    const [caller] = await ethers.getSigners();
    console.log("Caller:", await caller.getAddress());

    const admin = proxyAdminAddress || (await getEip1967AdminAddress(proxyAddress));
    console.log("ProxyAdmin:", admin);

    // Deploy new implementation (V2)
    const MarketV2 = await ethers.getContractFactory("MarketPredictV2");
    const implV2 = await upgrades.prepareUpgrade(proxyAddress, MarketV2);
    console.log("New implementation:", implV2);

    // Encode ProxyAdmin.upgradeAndCall(proxy, impl, data)
    const proxyAdminIface = new ethers.Interface([
        "function upgradeAndCall(address proxy, address implementation, bytes data) external payable",
    ]);

    const data = proxyAdminIface.encodeFunctionData("upgradeAndCall", [
        proxyAddress,
        implV2,
        "0x",
    ]);

    const timelock = await ethers.getContractAt(
        [
            "function getMinDelay() view returns (uint256)",
            "function schedule(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt,uint256 delay) external",
            "function execute(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt) external payable",
        ],
        timelockAddress,
        caller
    );

    const minDelay = await timelock.getMinDelay();
    const finalDelay = delaySeconds ?? Number(minDelay);
    console.log("Timelock minDelay:", Number(minDelay));
    console.log("Using delay:", finalDelay);

    const predecessor = ethers.ZeroHash;

    console.log("Scheduling...");
    const scheduleTx = await timelock.schedule(
        admin,
        0,
        data,
        predecessor,
        salt as any,
        finalDelay
    );
    await scheduleTx.wait();
    console.log("Scheduled:", scheduleTx.hash);

    console.log("NOTE: You must wait at least the delay, then run execute.");
    if (process.env.EXECUTE_NOW === "true") {
        console.log("Executing...");
        const execTx = await timelock.execute(
            admin,
            0,
            data,
            predecessor,
            salt as any
        );
        await execTx.wait();
        console.log("Executed:", execTx.hash);
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
