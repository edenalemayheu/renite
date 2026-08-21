import { expect } from "chai";
import hre from "hardhat";

// One shared network connection for the entire file – state isolation between
// test cases is achieved through fresh deployments inside each fixture.
const { ethers } = await hre.network.create();

// ─── helpers ────────────────────────────────────────────────────────────────

/** Compute the same hash the frontend would use before calling registerDevice. */
function makeHash(seed: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(seed));
}

/** Deploy a fresh DeviceRegistry and return it along with the default signers. */
async function deployDeviceRegistryFixture() {
  const registry = await ethers.deployContract("DeviceRegistry");
  const [owner, other, attacker] = await ethers.getSigners();
  return { registry, owner, other, attacker };
}

// ─── Registration ────────────────────────────────────────────────────────────

describe("DeviceRegistry", function () {
  describe("registerDevice", function () {
    it("emits DeviceRegistered with the correct hash and owner", async function () {
      const { registry, owner } = await deployDeviceRegistryFixture();
      const hash = makeHash("serial-001");

      await expect(registry.registerDevice(hash))
        .to.emit(registry, "DeviceRegistered")
        .withArgs(hash, owner.address, (ts: bigint) => ts > 0n);
    });

    it("increments totalDevices after each successful registration", async function () {
      const { registry } = await deployDeviceRegistryFixture();

      await registry.registerDevice(makeHash("dev-a"));
      await registry.registerDevice(makeHash("dev-b"));

      expect(await registry.totalDevices()).to.equal(2n);
    });

    it("reverts with DeviceRegistry__EmptyHash when given bytes32(0)", async function () {
      const { registry } = await deployDeviceRegistryFixture();

      await expect(
        registry.registerDevice(ethers.ZeroHash),
      ).to.be.revertedWithCustomError(registry, "DeviceRegistry__EmptyHash");
    });

    it("reverts with DeviceRegistry__AlreadyRegistered on a duplicate hash", async function () {
      const { registry } = await deployDeviceRegistryFixture();
      const hash = makeHash("duplicate-device");

      await registry.registerDevice(hash);

      await expect(
        registry.registerDevice(hash),
      ).to.be.revertedWithCustomError(
        registry,
        "DeviceRegistry__AlreadyRegistered",
      );
    });
  });

  // ─── Read functions ─────────────────────────────────────────────────────────

  describe("getDevice / isRegistered / ownerOf", function () {
    it("getDevice returns correct owner, timestamp, and initial status", async function () {
      const { registry, owner } = await deployDeviceRegistryFixture();
      const hash = makeHash("get-device-check");

      await registry.registerDevice(hash);
      const [storedOwner, registeredAt, status] = await registry.getDevice(hash);

      expect(storedOwner).to.equal(owner.address);
      expect(registeredAt).to.be.gt(0n);
      expect(status).to.equal(0n); // RecoveryStatus.Registered
    });

    it("isRegistered returns false before registration and true after", async function () {
      const { registry } = await deployDeviceRegistryFixture();
      const hash = makeHash("is-registered-check");

      expect(await registry.isRegistered(hash)).to.be.false;
      await registry.registerDevice(hash);
      expect(await registry.isRegistered(hash)).to.be.true;
    });

    it("ownerOf returns the current owner", async function () {
      const { registry, owner } = await deployDeviceRegistryFixture();
      const hash = makeHash("owner-of-check");

      await registry.registerDevice(hash);
      expect(await registry.ownerOf(hash)).to.equal(owner.address);
    });

    it("getDevice reverts with DeviceRegistry__NotFound for an unknown hash", async function () {
      const { registry } = await deployDeviceRegistryFixture();

      await expect(
        registry.getDevice(makeHash("nonexistent")),
      ).to.be.revertedWithCustomError(registry, "DeviceRegistry__NotFound");
    });

    it("ownerOf reverts with DeviceRegistry__NotFound for an unknown hash", async function () {
      const { registry } = await deployDeviceRegistryFixture();

      await expect(
        registry.ownerOf(makeHash("nonexistent-2")),
      ).to.be.revertedWithCustomError(registry, "DeviceRegistry__NotFound");
    });
  });

  // ─── Ownership transfer ──────────────────────────────────────────────────────

  describe("transferOwnership", function () {
    it("transfers ownership and emits OwnershipTransferred", async function () {
      const { registry, owner, other } = await deployDeviceRegistryFixture();
      const hash = makeHash("transfer-1");

      await registry.registerDevice(hash);

      await expect(registry.transferOwnership(hash, other.address))
        .to.emit(registry, "OwnershipTransferred")
        .withArgs(
          hash,
          owner.address,
          other.address,
          (ts: bigint) => ts > 0n,
        );

      expect(await registry.ownerOf(hash)).to.equal(other.address);
    });

    it("reverts with DeviceRegistry__NotOwner when called by a non-owner", async function () {
      const { registry, attacker } = await deployDeviceRegistryFixture();
      const hash = makeHash("transfer-2");

      await registry.registerDevice(hash);

      await expect(
        registry.connect(attacker).transferOwnership(hash, attacker.address),
      ).to.be.revertedWithCustomError(registry, "DeviceRegistry__NotOwner");
    });

    it("reverts with DeviceRegistry__ZeroAddress when newOwner is the zero address", async function () {
      const { registry } = await deployDeviceRegistryFixture();
      const hash = makeHash("transfer-3");

      await registry.registerDevice(hash);

      await expect(
        registry.transferOwnership(hash, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(registry, "DeviceRegistry__ZeroAddress");
    });

    it("reverts with DeviceRegistry__SameOwner when newOwner equals msg.sender", async function () {
      const { registry, owner } = await deployDeviceRegistryFixture();
      const hash = makeHash("transfer-4");

      await registry.registerDevice(hash);

      await expect(
        registry.transferOwnership(hash, owner.address),
      ).to.be.revertedWithCustomError(registry, "DeviceRegistry__SameOwner");
    });

    it("reverts with DeviceRegistry__NotFound for an unregistered hash", async function () {
      const { registry, other } = await deployDeviceRegistryFixture();

      await expect(
        registry.transferOwnership(makeHash("ghost"), other.address),
      ).to.be.revertedWithCustomError(registry, "DeviceRegistry__NotFound");
    });
  });

  // ─── Recovery status transitions ─────────────────────────────────────────────

  describe("updateRecoveryStatus", function () {
    it("advances status and emits RecoveryStatusUpdated", async function () {
      const { registry } = await deployDeviceRegistryFixture();
      const hash = makeHash("status-advance");

      await registry.registerDevice(hash);

      await expect(
        registry.updateRecoveryStatus(hash, 1 /* Verified */),
      )
        .to.emit(registry, "RecoveryStatusUpdated")
        .withArgs(hash, 0n, 1n, (ts: bigint) => ts > 0n);

      const [, , status] = await registry.getDevice(hash);
      expect(status).to.equal(1n);
    });

    it("allows skipping statuses (e.g. Registered → ReportedLost)", async function () {
      const { registry } = await deployDeviceRegistryFixture();
      const hash = makeHash("status-skip");

      await registry.registerDevice(hash);
      await registry.updateRecoveryStatus(hash, 2 /* ReportedLost */);

      const [, , status] = await registry.getDevice(hash);
      expect(status).to.equal(2n);
    });

    it("advances all the way to CaseClosed (6)", async function () {
      const { registry } = await deployDeviceRegistryFixture();
      const hash = makeHash("status-closed");

      await registry.registerDevice(hash);
      await registry.updateRecoveryStatus(hash, 6 /* CaseClosed */);

      const [, , status] = await registry.getDevice(hash);
      expect(status).to.equal(6n);
    });

    it("reverts with DeviceRegistry__InvalidStatusTransition on a backward move", async function () {
      const { registry } = await deployDeviceRegistryFixture();
      const hash = makeHash("status-backward");

      await registry.registerDevice(hash);
      await registry.updateRecoveryStatus(hash, 3);

      await expect(
        registry.updateRecoveryStatus(hash, 1),
      ).to.be.revertedWithCustomError(
        registry,
        "DeviceRegistry__InvalidStatusTransition",
      );
    });

    it("reverts with DeviceRegistry__InvalidStatusTransition when case is already closed", async function () {
      const { registry } = await deployDeviceRegistryFixture();
      const hash = makeHash("status-already-closed");

      await registry.registerDevice(hash);
      await registry.updateRecoveryStatus(hash, 6);

      await expect(
        registry.updateRecoveryStatus(hash, 6),
      ).to.be.revertedWithCustomError(
        registry,
        "DeviceRegistry__InvalidStatusTransition",
      );
    });

    it("reverts with DeviceRegistry__NotOwner when called by a non-owner", async function () {
      const { registry, attacker } = await deployDeviceRegistryFixture();
      const hash = makeHash("status-non-owner");

      await registry.registerDevice(hash);

      await expect(
        registry.connect(attacker).updateRecoveryStatus(hash, 1),
      ).to.be.revertedWithCustomError(registry, "DeviceRegistry__NotOwner");
    });

    it("reverts with DeviceRegistry__NotFound for an unregistered hash", async function () {
      const { registry } = await deployDeviceRegistryFixture();

      await expect(
        registry.updateRecoveryStatus(makeHash("ghost-status"), 1),
      ).to.be.revertedWithCustomError(registry, "DeviceRegistry__NotFound");
    });
  });
});
