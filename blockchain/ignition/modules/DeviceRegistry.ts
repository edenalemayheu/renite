import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Hardhat Ignition deployment module for DeviceRegistry.
 *
 * Usage — local EDR network:
 *   npx hardhat ignition deploy ignition/modules/DeviceRegistry.ts
 *
 * Usage — Sepolia testnet:
 *   npx hardhat ignition deploy ignition/modules/DeviceRegistry.ts --network sepolia
 *
 * The module has no constructor parameters. After deployment Ignition writes
 * the deployed address to ignition/deployments/<deploymentId>/deployed_addresses.json
 * which the backend blockchain service reads at startup.
 *
 * @see backend/services/blockchain.service.js
 */
const DeviceRegistryModule = buildModule("DeviceRegistryModule", (m) => {
  const deviceRegistry = m.contract("DeviceRegistry");

  return { deviceRegistry };
});

export default DeviceRegistryModule;
