import { ethers } from "hardhat";

// bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
const ADMIN_SLOT =
    "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;

export async function getEip1967AdminAddress(proxyAddress: string): Promise<string> {
    const raw = await ethers.provider.getStorage(proxyAddress, ADMIN_SLOT);
    const addr = ("0x" + raw.slice(-40)) as string;
    return ethers.getAddress(addr);
}
