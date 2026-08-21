import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Hardhat Ignition module for the DeviceRegistry contract.
 *
 * Deploy to a local simulated chain:
 *   npx hardhat ignition deploy ignition/modules/DeviceRegistry.ts
 *
 * Deploy to Sepolia (requires SEPOLIA_RPC_URL + SEPOLIA_PRIVATE_KEY config vars):
 *   npx hardhat ignition deploy --network sepolia ignition/modules/DeviceRegistry.ts
 *
 * The deployed contract address is written automatically to
 *   ignition/deployments/<chainId>/deployed_addresses.json
 * after a successful run.
 */
const DeviceRegistryModule = buildModule("DeviceRegistryModule", (m) => {
  const deviceRegistry = m.contract("DeviceRegistry");
  return { deviceRegistry };
});

export default DeviceRegistryModule;
