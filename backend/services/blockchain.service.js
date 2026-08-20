/**
 * blockchain.service.js
 *
 * Additive integration layer between the Renite backend and the
 * DeviceRegistry smart contract. This file is new -- it does not
 * modify any existing backend file.
 *
 * DESIGN PRINCIPLES
 * -----------------
 * 1. BLOCKING WITH GRACEFUL FAILURE.
 *    Each write method submits a transaction and waits for one
 *    confirmation via tx.wait() before returning. This means the
 *    caller will wait for on-chain confirmation, but a blockchain
 *    failure (network error, revert, timeout) returns null instead
 *    of throwing. Callers must treat a null return as "blockchain
 *    unavailable" and continue normally -- the backend operation
 *    must already be committed to MongoDB before calling this service.
 *
 * 2. NO PII ON-CHAIN.
 *    This service never accepts names, phone numbers, serial numbers,
 *    IMEI, MAC addresses, email addresses, or any other personally
 *    identifiable information. Callers pass a pre-computed bytes32
 *    hash (use hashEntityId()). Only the hash, a wallet address, and
 *    a timestamp reach the blockchain.
 *
 * 3. DISABLED BY DEFAULT.
 *    The service no-ops silently when BLOCKCHAIN_ENABLED != "true".
 *    All existing tests and local development work with zero
 *    additional setup. No env vars are required unless you opt in.
 *
 * 4. WALLET OWNERSHIP MODEL.
 *    The backend signing wallet (BLOCKCHAIN_PRIVATE_KEY) becomes the
 *    on-chain owner of every device it registers. This is intentional
 *    for v1 -- end users do not hold private keys. transferOwnership()
 *    is available for future per-user wallet support.
 *
 * REQUIRED ENVIRONMENT VARIABLES (when BLOCKCHAIN_ENABLED=true)
 * --------------------------------------------------------------
 *   BLOCKCHAIN_ENABLED       Set to exactly "true" to activate.
 *   BLOCKCHAIN_RPC_URL       JSON-RPC endpoint (Infura, Alchemy, etc.)
 *   BLOCKCHAIN_PRIVATE_KEY   Backend wallet private key (0x-prefixed hex)
 *   BLOCKCHAIN_CONTRACT_ADDR Deployed DeviceRegistry contract address
 *
 * See blockchain/.env.example for full documentation.
 *
 * RECOVERY STATUS ENUM  (mirrors DeviceRegistry.sol exactly)
 * -----------------------------------------------------------
 *   0  Registered
 *   1  Verified
 *   2  ReportedLost
 *   3  RecoveryStarted
 *   4  Found
 *   5  OwnershipConfirmed
 *   6  CaseClosed
 *
 * INTEGRATION POINTS IN THIS BACKEND
 * -----------------------------------
 *   report.service.js  create()        -- anchors LOST reports only
 *   match.service.js   updateStatus()  -- advances status on ACCEPTED
 */

import { createHash } from 'crypto';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// RecoveryStatus enum -- mirrors DeviceRegistry.sol exactly.
// Import this wherever you need to pass a status value to this service.
// ---------------------------------------------------------------------------
export const RecoveryStatus = Object.freeze({
  Registered:         0,
  Verified:           1,
  ReportedLost:       2,
  RecoveryStarted:    3,
  Found:              4,
  OwnershipConfirmed: 5,
  CaseClosed:         6,
});

// ---------------------------------------------------------------------------
// Minimal ABI -- only the functions and events this backend needs.
// The full versioned ABI lives at blockchain/abi/DeviceRegistry.json.
// ---------------------------------------------------------------------------
const DEVICE_REGISTRY_ABI = [
  'function registerDevice(bytes32 deviceHash) external returns (uint256 deviceId)',
  'function transferOwnership(uint256 deviceId, address newOwner) external',
  'function updateRecoveryStatus(uint256 deviceId, uint8 newStatus) external',
  'function getDevice(uint256 deviceId) external view returns (bytes32 deviceHash, address owner, uint256 registeredAt, uint8 status)',
  'function totalDevices() external view returns (uint256)',
  'event DeviceRegistered(uint256 indexed deviceId, address indexed owner, bytes32 deviceHash, uint256 registeredAt)',
  'event OwnershipTransferred(uint256 indexed deviceId, address indexed previousOwner, address indexed newOwner, uint256 transferredAt)',
  'event RecoveryStatusUpdated(uint256 indexed deviceId, uint8 previousStatus, uint8 newStatus, uint256 updatedAt)',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isEnabled() {
  return process.env.BLOCKCHAIN_ENABLED === 'true';
}

/**
 * Build and return a connected contract instance.
 * Returns null (with a console warning) if any required env variable
 * is missing or if the provider/wallet cannot be initialised.
 * Never throws.
 *
 * @returns {import('ethers').Contract | null}
 */
function getContract() {
  const rpcUrl       = process.env.BLOCKCHAIN_RPC_URL;
  const privateKey   = process.env.BLOCKCHAIN_PRIVATE_KEY;
  const contractAddr = process.env.BLOCKCHAIN_CONTRACT_ADDR;

  if (!rpcUrl || !privateKey || !contractAddr) {
    console.warn(
      '[BlockchainService] One or more required env variables are missing ' +
      '(BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, BLOCKCHAIN_CONTRACT_ADDR). ' +
      'Blockchain anchoring is disabled for this call.'
    );
    return null;
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet   = new ethers.Wallet(privateKey, provider);
    return new ethers.Contract(contractAddr, DEVICE_REGISTRY_ABI, wallet);
  } catch (err) {
    console.error('[BlockchainService] Failed to initialise contract:', err.message);
    return null;
  }
}

/**
 * Log a blockchain operation failure in a structured way.
 * Keeps blockchain errors out of the main Express error handler
 * while keeping them visible in server logs and APM tools.
 *
 * IMPORTANT: The private key is never logged here. Only the error
 * message, ethers error code, and revert reason are captured.
 */
function logBlockchainError(operation, err) {
  console.error(`[BlockchainService] ${operation} failed:`, {
    message: err.message,
    code:    err.code    ?? null,
    reason:  err.reason  ?? null,
  });
}

// ---------------------------------------------------------------------------
// Public service object
// ---------------------------------------------------------------------------

export const blockchainService = {

  /**
   * Derive a deterministic, privacy-safe bytes32 hash from a backend
   * entity identifier (MongoDB ObjectId string, UUID, etc.).
   *
   * The hash is a one-way SHA-256 digest. The original identifier is
   * not recoverable from the on-chain value. No PII is derived from
   * the hash. The returned string is safe to store on-chain.
   *
   * @param  {string} entityId  - MongoDB ObjectId.toString(), UUID, etc.
   * @returns {string}           - '0x'-prefixed 32-byte hex string
   */
  hashEntityId(entityId) {
    const digest = createHash('sha256').update(String(entityId)).digest('hex');
    return `0x${digest}`;
  },

  /**
   * Register a device on-chain by its pre-computed bytes32 hash.
   *
   * Submits a transaction and waits for one block confirmation before
   * returning. If the node is unreachable, the transaction reverts, or
   * any other error occurs, this method returns null -- it does not throw.
   *
   * The caller is responsible for persisting the returned deviceId and
   * txHash to MongoDB (Report.blockchain_device_id / blockchain_tx_hash)
   * after this call returns successfully.
   *
   * @param  {string} deviceHash
   *         bytes32 hex string -- must be produced by hashEntityId().
   *         Never pass raw PII here.
   *
   * @returns {Promise<{ deviceId: bigint, txHash: string } | null>}
   *          null on any failure -- caller must handle gracefully.
   */
  async registerDevice(deviceHash) {
    if (!isEnabled()) return null;
    const contract = getContract();
    if (!contract) return null;

    try {
      const tx      = await contract.registerDevice(deviceHash);
      const receipt = await tx.wait(); // waits for 1 confirmation

      let deviceId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === 'DeviceRegistered') {
            deviceId = parsed.args.deviceId;
            break;
          }
        } catch {
          // Log belongs to a different contract -- skip silently
        }
      }

      console.info('[BlockchainService] registerDevice confirmed', {
        deviceId:    deviceId?.toString(),
        txHash:      receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return { deviceId, txHash: receipt.hash };
    } catch (err) {
      logBlockchainError('registerDevice', err);
      return null;
    }
  },

  /**
   * Advance the on-chain recovery status for a registered device.
   *
   * The contract enforces strict forward-only progression. If you pass
   * a status value <= the current on-chain status the transaction will
   * revert and this method will return null.
   *
   * Submits a transaction and waits for one block confirmation.
   * Returns null on any failure -- does not throw.
   *
   * @param  {bigint | number | string} deviceId
   *         The on-chain device ID returned by registerDevice().
   *         Stored in Report.blockchain_device_id.
   *
   * @param  {number} newStatus
   *         A value from the RecoveryStatus enum exported by this module.
   *
   * @returns {Promise<{ txHash: string } | null>}
   */
  async updateRecoveryStatus(deviceId, newStatus) {
    if (!isEnabled()) return null;
    const contract = getContract();
    if (!contract) return null;

    try {
      const tx      = await contract.updateRecoveryStatus(deviceId, newStatus);
      const receipt = await tx.wait(); // waits for 1 confirmation

      console.info('[BlockchainService] updateRecoveryStatus confirmed', {
        deviceId:  deviceId.toString(),
        newStatus,
        txHash:    receipt.hash,
      });

      return { txHash: receipt.hash };
    } catch (err) {
      logBlockchainError('updateRecoveryStatus', err);
      return null;
    }
  },

  /**
   * Transfer on-chain ownership of a device to a different wallet address.
   *
   * In the current v1 architecture the backend wallet owns every device
   * it registers. This method exists for future use when per-user wallet
   * ownership is introduced.
   *
   * Submits a transaction and waits for one block confirmation.
   * Returns null on any failure -- does not throw.
   *
   * @param  {bigint | number | string} deviceId
   * @param  {string} newOwner  - Ethereum wallet address (0x-prefixed)
   * @returns {Promise<{ txHash: string } | null>}
   */
  async transferOwnership(deviceId, newOwner) {
    if (!isEnabled()) return null;
    const contract = getContract();
    if (!contract) return null;

    try {
      const tx      = await contract.transferOwnership(deviceId, newOwner);
      const receipt = await tx.wait(); // waits for 1 confirmation

      console.info('[BlockchainService] transferOwnership confirmed', {
        deviceId: deviceId.toString(),
        newOwner,
        txHash:   receipt.hash,
      });

      return { txHash: receipt.hash };
    } catch (err) {
      logBlockchainError('transferOwnership', err);
      return null;
    }
  },

  /**
   * Read device data from the contract.
   *
   * This is a view call -- no transaction is submitted and no gas is
   * spent. Returns null on any failure.
   *
   * @param  {bigint | number | string} deviceId
   * @returns {Promise<{
   *   deviceHash:   string,
   *   owner:        string,
   *   registeredAt: bigint,
   *   status:       number
   * } | null>}
   */
  async getDevice(deviceId) {
    if (!isEnabled()) return null;
    const contract = getContract();
    if (!contract) return null;

    try {
      const [deviceHash, owner, registeredAt, status] =
        await contract.getDevice(deviceId);
      return { deviceHash, owner, registeredAt, status };
    } catch (err) {
      logBlockchainError('getDevice', err);
      return null;
    }
  },

  /**
   * Return the total number of devices registered on-chain.
   *
   * View call -- no gas cost. Returns null on any failure.
   *
   * @returns {Promise<bigint | null>}
   */
  async totalDevices() {
    if (!isEnabled()) return null;
    const contract = getContract();
    if (!contract) return null;

    try {
      return await contract.totalDevices();
    } catch (err) {
      logBlockchainError('totalDevices', err);
      return null;
    }
  },
};
