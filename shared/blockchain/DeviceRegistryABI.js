// AUTO-GENERATED - do not edit by hand.
// Source: blockchain/artifacts/contracts/DeviceRegistry.sol/DeviceRegistry.json
// Regenerate: cd blockchain && npx hardhat compile

/**
 * ABI for the DeviceRegistry contract.
 * Covers all errors, events, and functions produced by solc 0.8.28.
 */
export const DEVICE_REGISTRY_ABI = [
  // ── Custom errors ──────────────────────────────────────────────────────────
  {
    type: "error",
    name: "DeviceRegistry__AlreadyRegistered",
    inputs: [{ name: "deviceHash", type: "bytes32", internalType: "bytes32" }],
  },
  {
    type: "error",
    name: "DeviceRegistry__EmptyHash",
    inputs: [],
  },
  {
    type: "error",
    name: "DeviceRegistry__InvalidStatusTransition",
    inputs: [
      { name: "deviceHash", type: "bytes32", internalType: "bytes32" },
      { name: "current",    type: "uint8",   internalType: "enum DeviceRegistry.RecoveryStatus" },
      { name: "requested",  type: "uint8",   internalType: "enum DeviceRegistry.RecoveryStatus" },
    ],
  },
  {
    type: "error",
    name: "DeviceRegistry__NotFound",
    inputs: [{ name: "deviceHash", type: "bytes32", internalType: "bytes32" }],
  },
  {
    type: "error",
    name: "DeviceRegistry__NotOwner",
    inputs: [
      { name: "deviceHash", type: "bytes32",  internalType: "bytes32" },
      { name: "caller",     type: "address",  internalType: "address" },
    ],
  },
  {
    type: "error",
    name: "DeviceRegistry__SameOwner",
    inputs: [
      { name: "deviceHash", type: "bytes32",  internalType: "bytes32" },
      { name: "owner",      type: "address",  internalType: "address" },
    ],
  },
  {
    type: "error",
    name: "DeviceRegistry__ZeroAddress",
    inputs: [],
  },

  // ── Events ─────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "DeviceRegistered",
    anonymous: false,
    inputs: [
      { name: "deviceHash",   type: "bytes32", internalType: "bytes32", indexed: true  },
      { name: "owner",        type: "address", internalType: "address", indexed: true  },
      { name: "registeredAt", type: "uint256", internalType: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    anonymous: false,
    inputs: [
      { name: "deviceHash",     type: "bytes32", internalType: "bytes32", indexed: true  },
      { name: "previousOwner",  type: "address", internalType: "address", indexed: true  },
      { name: "newOwner",       type: "address", internalType: "address", indexed: true  },
      { name: "transferredAt",  type: "uint256", internalType: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RecoveryStatusUpdated",
    anonymous: false,
    inputs: [
      { name: "deviceHash",     type: "bytes32", internalType: "bytes32", indexed: true  },
      { name: "previousStatus", type: "uint8",   internalType: "enum DeviceRegistry.RecoveryStatus", indexed: false },
      { name: "newStatus",      type: "uint8",   internalType: "enum DeviceRegistry.RecoveryStatus", indexed: false },
      { name: "updatedAt",      type: "uint256", internalType: "uint256", indexed: false },
    ],
  },

  // ── Read functions ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "getDevice",
    stateMutability: "view",
    inputs:  [{ name: "deviceHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "owner",        type: "address", internalType: "address" },
      { name: "registeredAt", type: "uint256", internalType: "uint256" },
      { name: "status",       type: "uint8",   internalType: "enum DeviceRegistry.RecoveryStatus" },
    ],
  },
  {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs:  [{ name: "deviceHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs:  [{ name: "deviceHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
  },
  {
    type: "function",
    name: "totalDevices",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
  },

  // ── Write functions ────────────────────────────────────────────────────────
  {
    type: "function",
    name: "registerDevice",
    stateMutability: "nonpayable",
    inputs:  [{ name: "deviceHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [
      { name: "deviceHash", type: "bytes32", internalType: "bytes32" },
      { name: "newOwner",   type: "address", internalType: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateRecoveryStatus",
    stateMutability: "nonpayable",
    inputs: [
      { name: "deviceHash", type: "bytes32", internalType: "bytes32" },
      { name: "newStatus",  type: "uint8",   internalType: "enum DeviceRegistry.RecoveryStatus" },
    ],
    outputs: [],
  },
];
