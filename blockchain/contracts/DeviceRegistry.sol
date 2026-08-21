// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DeviceRegistry
/// @notice Privacy-preserving on-chain registry for devices.
///         Each device is identified by a keccak256 hash of its
///         real-world identifier so no sensitive data ever touches
///         the chain.  The contract records ownership, a registration
///         timestamp, and a recovery-lifecycle status that can only
///         advance forward.
///
/// @dev    Design decisions:
///         - Primary key is `bytes32 deviceHash` (not an auto-increment
///           integer) so callers can look up a device without storing a
///           separate ID, and duplicate registrations of the same physical
///           device are prevented at the contract level.
///         - `RecoveryStatus` is a strictly-forward enum; `CaseClosed` is
///           terminal.  Only the current owner may advance the status or
///           transfer ownership.
///         - Custom errors are used for all revert paths (cheaper than
///           string revert messages at runtime, and machine-readable for
///           off-chain tooling).
///         - No `Ownable` / admin role: every device is self-sovereign.
///           Future governance can be layered on top via a separate
///           registry-manager contract that is given owner privileges at
///           deployment time.
contract DeviceRegistry {

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Transitions must move strictly forward.  `CaseClosed` is terminal.
    enum RecoveryStatus {
        Registered,        // 0 – default state after registration
        Verified,          // 1 – ownership verified by a trusted party
        ReportedLost,      // 2 – owner reported the device missing
        RecoveryStarted,   // 3 – active recovery operation underway
        Found,             // 4 – device has been located
        OwnershipConfirmed,// 5 – new or original owner confirmed
        CaseClosed         // 6 – terminal; no further status changes allowed
    }

    /// @notice On-chain record for a single registered device.
    struct Device {
        bytes32 deviceHash;     // keccak256 of the real-world identifier
        address owner;          // Ethereum address of the current owner
        uint256 registeredAt;   // block.timestamp at registration
        RecoveryStatus status;  // current lifecycle status
        bool exists;            // guard flag — false means "not registered"
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Primary store: deviceHash → Device.
    mapping(bytes32 => Device) private _devices;

    /// @dev Running count of registered devices (informational; never decrements).
    uint256 private _totalDevices;

    // ─────────────────────────────────────────────────────────────────────────
    // Custom errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when `deviceHash` is the zero value.
    error DeviceRegistry__EmptyHash();

    /// @notice Emitted when the caller tries to register a hash that already
    ///         exists in the registry.
    error DeviceRegistry__AlreadyRegistered(bytes32 deviceHash);

    /// @notice Emitted when a lookup is performed on a hash that has never
    ///         been registered.
    error DeviceRegistry__NotFound(bytes32 deviceHash);

    /// @notice Emitted when a caller other than the device owner attempts a
    ///         privileged operation.
    error DeviceRegistry__NotOwner(bytes32 deviceHash, address caller);

    /// @notice Emitted when `newOwner` is the zero address.
    error DeviceRegistry__ZeroAddress();

    /// @notice Emitted when `newOwner` is the same as the current owner.
    error DeviceRegistry__SameOwner(bytes32 deviceHash, address owner);

    /// @notice Emitted when a status transition is invalid (backward move or
    ///         already-closed case).
    error DeviceRegistry__InvalidStatusTransition(
        bytes32 deviceHash,
        RecoveryStatus current,
        RecoveryStatus requested
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Fired when a new device is successfully registered.
    event DeviceRegistered(
        bytes32 indexed deviceHash,
        address indexed owner,
        uint256 registeredAt
    );

    /// @notice Fired when ownership of a device changes.
    event OwnershipTransferred(
        bytes32 indexed deviceHash,
        address indexed previousOwner,
        address indexed newOwner,
        uint256 transferredAt
    );

    /// @notice Fired when a device's recovery status advances.
    event RecoveryStatusUpdated(
        bytes32 indexed deviceHash,
        RecoveryStatus previousStatus,
        RecoveryStatus newStatus,
        uint256 updatedAt
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier deviceExists(bytes32 deviceHash) {
        if (!_devices[deviceHash].exists) {
            revert DeviceRegistry__NotFound(deviceHash);
        }
        _;
    }

    modifier onlyDeviceOwner(bytes32 deviceHash) {
        if (!_devices[deviceHash].exists) {
            revert DeviceRegistry__NotFound(deviceHash);
        }
        if (_devices[deviceHash].owner != msg.sender) {
            revert DeviceRegistry__NotOwner(deviceHash, msg.sender);
        }
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Write functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register a device on-chain.
    /// @dev    The caller becomes the device owner.  `deviceHash` must be a
    ///         non-zero `bytes32` value and must not already be registered.
    ///         Off-chain callers should compute:
    ///           deviceHash = keccak256(abi.encodePacked(serialNumber, ownerAddress))
    ///         or any deterministic, collision-resistant scheme.
    /// @param  deviceHash  keccak256 hash of the device's real-world identifier.
    function registerDevice(bytes32 deviceHash) external {
        if (deviceHash == bytes32(0)) {
            revert DeviceRegistry__EmptyHash();
        }
        if (_devices[deviceHash].exists) {
            revert DeviceRegistry__AlreadyRegistered(deviceHash);
        }

        _devices[deviceHash] = Device({
            deviceHash:   deviceHash,
            owner:        msg.sender,
            registeredAt: block.timestamp,
            status:       RecoveryStatus.Registered,
            exists:       true
        });

        unchecked { ++_totalDevices; }

        emit DeviceRegistered(deviceHash, msg.sender, block.timestamp);
    }

    /// @notice Transfer ownership of a registered device to a new address.
    /// @dev    Only the current owner may call this.  Neither the zero address
    ///         nor the current owner itself is a valid `newOwner`.
    /// @param  deviceHash  Hash of the device to transfer.
    /// @param  newOwner    Ethereum address of the new owner.
    function transferOwnership(bytes32 deviceHash, address newOwner)
        external
        onlyDeviceOwner(deviceHash)
    {
        if (newOwner == address(0)) {
            revert DeviceRegistry__ZeroAddress();
        }
        if (newOwner == msg.sender) {
            revert DeviceRegistry__SameOwner(deviceHash, msg.sender);
        }

        address previousOwner = _devices[deviceHash].owner;
        _devices[deviceHash].owner = newOwner;

        emit OwnershipTransferred(deviceHash, previousOwner, newOwner, block.timestamp);
    }

    /// @notice Advance a device's recovery lifecycle status.
    /// @dev    Status must strictly increase; `CaseClosed` (6) is terminal.
    ///         Only the current owner may advance the status.
    /// @param  deviceHash  Hash of the target device.
    /// @param  newStatus   The desired next status (must be > current).
    function updateRecoveryStatus(bytes32 deviceHash, RecoveryStatus newStatus)
        external
        onlyDeviceOwner(deviceHash)
    {
        RecoveryStatus current = _devices[deviceHash].status;

        // Terminal state check
        if (current == RecoveryStatus.CaseClosed) {
            revert DeviceRegistry__InvalidStatusTransition(deviceHash, current, newStatus);
        }
        // Forward-only check
        if (newStatus <= current) {
            revert DeviceRegistry__InvalidStatusTransition(deviceHash, current, newStatus);
        }

        _devices[deviceHash].status = newStatus;

        emit RecoveryStatusUpdated(deviceHash, current, newStatus, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Returns full details of a registered device.
    /// @dev    Reverts with `DeviceRegistry__NotFound` if the hash is unknown.
    /// @param  deviceHash  Hash of the device to query.
    /// @return owner        Current owner address.
    /// @return registeredAt Block timestamp at registration.
    /// @return status       Current `RecoveryStatus`.
    function getDevice(bytes32 deviceHash)
        external
        view
        deviceExists(deviceHash)
        returns (
            address  owner,
            uint256  registeredAt,
            RecoveryStatus status
        )
    {
        Device storage d = _devices[deviceHash];
        return (d.owner, d.registeredAt, d.status);
    }

    /// @notice Returns `true` if `deviceHash` has been registered.
    /// @param  deviceHash  Hash to check.
    function isRegistered(bytes32 deviceHash) external view returns (bool) {
        return _devices[deviceHash].exists;
    }

    /// @notice Returns the current owner of a registered device.
    /// @dev    Reverts with `DeviceRegistry__NotFound` if not registered.
    /// @param  deviceHash  Hash of the device.
    function ownerOf(bytes32 deviceHash)
        external
        view
        deviceExists(deviceHash)
        returns (address)
    {
        return _devices[deviceHash].owner;
    }

    /// @notice Total number of devices ever registered (never decrements).
    function totalDevices() external view returns (uint256) {
        return _totalDevices;
    }
}
