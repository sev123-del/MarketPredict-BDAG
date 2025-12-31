import { ethers, upgrades } from "hardhat";
import { getEip1967AdminAddress } from "./_eip1967";

function mustGetEnv(name: string): string {
    const v = process.env[name];
    if (!v || !v.trim()) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return v.trim();
}

function parseAddrList(raw: string | undefined): string[] {
    const v = (raw || "").trim();
    if (!v) return [];
    return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

async function main() {
    const ownerAddress = mustGetEnv("CONTRACT_OWNER"); // multisig Safe address
    const pauserAddress = (process.env.PAUSER_ADDRESS || ownerAddress).trim();

    // Upgrades timelock config (affects ProxyAdmin owner)
    const minDelaySeconds = Number(process.env.TIMELOCK_DELAY_SECONDS || "86400");
    const proposers = parseAddrList(process.env.TIMELOCK_PROPOSERS) || [];
    const executors = parseAddrList(process.env.TIMELOCK_EXECUTORS) || [];

    if (!Number.isFinite(minDelaySeconds) || minDelaySeconds < 0) {
        throw new Error("TIMELOCK_DELAY_SECONDS must be a non-negative number");
    }

    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", await deployer.getAddress());

    // 1) Deploy proxy
    const MarketPredict = await ethers.getContractFactory("MarketPredict");
    const proxy = await upgrades.deployProxy(MarketPredict, [], {
        initializer: "initialize",
        kind: "transparent",
    });
    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    console.log("MarketPredict (proxy):", proxyAddress);

    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    const proxyAdminAddress = await getEip1967AdminAddress(proxyAddress);
    console.log("Implementation:", implAddress);
    console.log("ProxyAdmin:", proxyAdminAddress);

    // 2) Deploy TimelockController (for upgrades only)
    // OZ TimelockController constructor: (minDelay, proposers, executors, admin)
    const Timelock = await ethers.getContractFactory("MP_TimelockController");

    // If proposers/executors not supplied, default to the multisig safe.
    const p = proposers.length > 0 ? proposers : [ownerAddress];
    const e = executors.length > 0 ? executors : [ownerAddress];

    const timelock = await Timelock.deploy(minDelaySeconds, p, e, ownerAddress);
    await timelock.waitForDeployment();
    const timelockAddress = await timelock.getAddress();
    console.log("TimelockController:", timelockAddress);

    // 3) Configure emergency pause (no delay): set pauser to multisig
    try {
        const tx = await (proxy as any).setPauser(pauserAddress);
        await tx.wait();
        console.log("Pauser set to:", pauserAddress);
    } catch (err) {
        console.warn("WARN: setPauser failed (ABI or contract mismatch?)", String((err as any)?.message || err));
    }

    // 4) Transfer contract ownership to multisig Safe (operational admin)
    const currentOwner = String(await (proxy as any).owner()).toLowerCase();
    if (currentOwner !== ownerAddress.toLowerCase()) {
        const tx = await (proxy as any).transferOwnership(ownerAddress);
        await tx.wait();
        console.log("Contract owner transferred to:", ownerAddress);
    } else {
        console.log("Contract owner already set to:", ownerAddress);
    }

    // 5) Transfer ProxyAdmin ownership to timelock (upgrades now delayed)
    // (Avoid relying on upgrades.admin helpers; keep this script stable across plugin versions.)
    const proxyAdminOwnable = new ethers.Contract(
        proxyAdminAddress,
        ["function transferOwnership(address newOwner) external"],
        deployer
    );
    const txAdmin = await proxyAdminOwnable.transferOwnership(timelockAddress);
    await txAdmin.wait();
    console.log("ProxyAdmin ownership transferred to timelock");

    console.log("\nNEXT STEPS");
    console.log("- Use the timelock to schedule/execute upgrades (ProxyAdmin owner is timelock).\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
