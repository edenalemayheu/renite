/**
 * deviceRegistryService.js
 *
 * Client-side service for interacting with the DeviceRegistry smart contract.
 *
 * Usage (requires MetaMask / EIP-1193 wallet in the browser):
 *
 *   import { deviceRegistryService } from '@blockchain/deviceRegistryService';
 *
 *   // Check before registering (no wallet needed – uses read-only provider)
 *   const already = await deviceRegistryService.isRegistered('SN-998123');
 *
 *   // Register (prompts the user's wallet for a signature)
 *   const { hash, tx } = await deviceRegistryService.registerDevice('SN-998123');
 *   await tx.wait();
 *
 * Environment variables (Vite):
 *   VITE_DEVICE_REGISTRY_ADDRESS  – deployed contract address (required for writes)
 *   VITE_RPC_URL                  – read-only JSON-RPC endpoint (optional; falls back
 *                                   to window.ethereum for reads too)
 *
 * RecoveryStatus enum values (must match the Solidity enum order):
 *   0 = Registered  1 = Verified       2 = ReportedLost
 *   3 = RecoveryStarted  4 = Found     5 = OwnershipConfirmed  6 = CaseClosed
 */

import { BrowserProvider, JsonRpcProvider, Contract, keccak256, toUtf8Bytes } from "ethers";
import { DEVICE_REGISTRY_ABI } from "./DeviceRegistryABI.js";

// ─── RecoveryStatus enum (mirrors Solidity) ──────────────────────────────────

export const RecoveryStatus = Object.freeze({
  Registered:         0,
  Verified:           1,
  ReportedLost:       2,
  RecoveryStarted:    3,
  Found:              4,
  OwnershipConfirmed: 5,
  CaseClosed:         6,
});

export const RecoveryStatusLabel = Object.freeze({
  0: "Registered",
  1: "Verified",
  2: "Reported Lost",
  3: "Recovery Started",
  4: "Found",
  5: "Ownership Confirmed",
  6: "Case Closed",
});

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Derive the on-chain bytes32 hash for a device's real-world identifier.
 * The same formula must be used consistently — here we hash the raw UTF-8
 * bytes of the serial number string so the frontend and contract always agree.
 *
 * @param {string} serialNumber  The device serial number (or any stable identifier).
 * @returns {string}  A 0x-prefixed bytes32 hex string.
 */
export function computeDeviceHash(serialNumber) {
  if (!serialNumber || typeof serialNumber !== "string" || !serialNumber.trim()) {
    throw new Error("computeDeviceHash: serialNumber must be a non-empty string");
  }
  return keccak256(toUtf8Bytes(serialNumber.trim()));
}

/**
 * Build a read-only provider.
 * Prefers VITE_RPC_URL; falls back to the injected wallet provider.
 *
 * @returns {JsonRpcProvider | BrowserProvider}
 */
function getReadProvider() {
  const rpcUrl = import.meta.env?.VITE_RPC_URL;
  if (rpcUrl) {
    return new JsonRpcProvider(rpcUrl);
  }
  if (typeof window !== "undefined" && window.ethereum) {
    return new BrowserProvider(window.ethereum);
  }
  throw new Error(
    "No RPC provider available. Set VITE_RPC_URL or install a Web3 wallet.",
  );
}

/**
 * Build a signer-backed provider (requires wallet interaction).
 *
 * @returns {Promise<import('ethers').Signer>}
 */
async function getSigner() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "No Web3 wallet detected. Please install MetaMask or a compatible wallet.",
    );
  }
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

/**
 * Return the contract address from the environment.
 * Throws a descriptive error if it is not configured.
 */
function getContractAddress() {
  const addr = import.meta.env?.VITE_DEVICE_REGISTRY_ADDRESS;
  if (!addr) {
    throw new Error(
      "VITE_DEVICE_REGISTRY_ADDRESS is not set. " +
      "Add it to your .env file after deploying the contract.",
    );
  }
  return addr;
}

/**
 * Return a read-only contract instance (no signer).
 */
function getReadContract() {
  return new Contract(getContractAddress(), DEVICE_REGISTRY_ABI, getReadProvider());
}

/**
 * Return a write-enabled contract instance (requires wallet).
 *
 * @returns {Promise<Contract>}
 */
async function getWriteContract() {
  const signer = await getSigner();
  return new Contract(getContractAddress(), DEVICE_REGISTRY_ABI, signer);
}

// ─── Public service API ───────────────────────────────────────────────────────

export const deviceRegistryService = {
  /**
   * Check whether a device serial number is already registered on-chain.
   * This is a read-only call — no wallet needed.
   *
   * @param {string} serialNumber
   * @returns {Promise<boolean>}
   */
  async isRegistered(serialNumber) {
    const hash = computeDeviceHash(serialNumber);
    const contract = getReadContract();
    return contract.isRegistered(hash);
  },

  /**
   * Fetch the full on-chain record for a device.
   * Returns null if the device has never been registered.
   *
   * @param {string} serialNumber
   * @returns {Promise<{
   *   deviceHash: string,
   *   owner: string,
   *   registeredAt: Date,
   *   statusCode: number,
   *   statusLabel: string,
   * } | null>}
   */
  async getDevice(serialNumber) {
    const hash = computeDeviceHash(serialNumber);
    const contract = getReadContract();

    const registered = await contract.isRegistered(hash);
    if (!registered) return null;

    const [owner, registeredAtBigInt, statusCode] = await contract.getDevice(hash);
    return {
      deviceHash:   hash,
      owner,
      registeredAt: new Date(Number(registeredAtBigInt) * 1000),
      statusCode:   Number(statusCode),
      statusLabel:  RecoveryStatusLabel[Number(statusCode)] ?? "Unknown",
    };
  },

  /**
   * Register a device on-chain.  Prompts the user's wallet for approval.
   *
   * @param {string} serialNumber
   * @returns {Promise<{ deviceHash: string, tx: import('ethers').TransactionResponse }>}
   * @throws If the hash is already registered or the wallet rejects the tx.
   */
  async registerDevice(serialNumber) {
    const hash = computeDeviceHash(serialNumber);

    // Pre-flight duplicate check (saves gas on a likely-duplicate call)
    const contract = getReadContract();
    const alreadyRegistered = await contract.isRegistered(hash);
    if (alreadyRegistered) {
      throw new Error(
        `Device "${serialNumber}" is already registered on-chain. ` +
        "Each serial number can only be registered once.",
      );
    }

    const writeContract = await getWriteContract();
    const tx = await writeContract.registerDevice(hash);
    return { deviceHash: hash, tx };
  },

  /**
   * Transfer on-chain ownership of a device to a new Ethereum address.
   * The caller must be the current owner.
   *
   * @param {string} serialNumber
   * @param {string} newOwnerAddress  0x-prefixed Ethereum address.
   * @returns {Promise<import('ethers').TransactionResponse>}
   */
  async transferOwnership(serialNumber, newOwnerAddress) {
    const hash = computeDeviceHash(serialNumber);
    const writeContract = await getWriteContract();
    return writeContract.transferOwnership(hash, newOwnerAddress);
  },

  /**
   * Advance the recovery lifecycle status of a device.
   * The caller must be the current owner.
   *
   * @param {string}         serialNumber
   * @param {number}         newStatus    One of the RecoveryStatus enum values.
   * @returns {Promise<import('ethers').TransactionResponse>}
   */
  async updateRecoveryStatus(serialNumber, newStatus) {
    const hash = computeDeviceHash(serialNumber);
    const writeContract = await getWriteContract();
    return writeContract.updateRecoveryStatus(hash, newStatus);
  },

  /**
   * Return the total number of devices ever registered (read-only).
   *
   * @returns {Promise<number>}
   */
  async totalDevices() {
    const contract = getReadContract();
    const total = await contract.totalDevices();
    return Number(total);
  },
};
