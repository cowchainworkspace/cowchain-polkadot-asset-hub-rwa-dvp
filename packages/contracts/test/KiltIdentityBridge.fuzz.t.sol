// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import { Test } from "forge-std/Test.sol";
import { KiltIdentityBridge } from "../src/KiltIdentityBridge.sol";
import { ISystem, SYSTEM_PRECOMPILE } from "../src/precompiles/ISystem.sol";
import { IIdentity } from "@onchain-id/solidity/contracts/interface/IIdentity.sol";

/**
 * @title KiltIdentityBridge property (fuzz) tests
 * @notice Proves the bridge's accept/reject decision over the whole input space: a claim is accepted
 *         ONLY when the key is trusted, the signature is exactly 64 bytes, and the credential is not
 *         expired — and rejected for any deviation. The System precompile (0x900) is mocked to "valid"
 *         so these tests isolate the bridge's own gating logic from sr25519 cryptography (verified
 *         on-chain by the integration probe).
 */
contract KiltIdentityBridgeFuzzTest is Test {
    KiltIdentityBridge internal bridge;

    bytes32 internal trustedKey = bytes32(uint256(0xA77E5));
    address internal investorIdentity = address(0x1D);
    uint256 internal constant KYC_TOPIC = 1;
    bytes32 internal rootHash = keccak256("kilt-credential-root");

    function setUp() public {
        vm.warp(1_000_000);
        bridge = new KiltIdentityBridge();
        bridge.trustAttesterKey(trustedKey);
        vm.mockCall(SYSTEM_PRECOMPILE, abi.encodeWithSelector(ISystem.sr25519Verify.selector), abi.encode(true));
    }

    function _data(bytes32 key, uint256 validUntil) internal view returns (bytes memory) {
        return abi.encode(key, rootHash, validUntil);
    }

    /// @notice Any key other than the trusted one is rejected, even with a valid signature.
    function testFuzz_rejectsUntrustedKey(bytes32 key) public {
        vm.assume(key != trustedKey);
        bytes memory data = _data(key, block.timestamp + 1 days);
        assertFalse(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, new bytes(64), data));
    }

    /// @notice Any signature whose length is not exactly 64 bytes is rejected.
    function testFuzz_rejectsWrongSignatureLength(uint8 len) public {
        vm.assume(len != 64);
        bytes memory data = _data(trustedKey, block.timestamp + 1 days);
        assertFalse(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, new bytes(len), data));
    }

    /// @notice Any non-zero validUntil strictly in the past is rejected.
    function testFuzz_rejectsExpiredCredential(uint256 validUntil) public {
        validUntil = bound(validUntil, 1, block.timestamp - 1);
        bytes memory data = _data(trustedKey, validUntil);
        assertFalse(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, new bytes(64), data));
    }

    /// @notice A trusted key, 64-byte signature, and unexpired (or sentinel-0) validUntil is accepted.
    function testFuzz_acceptsTrustedUnexpired(uint256 validUntil) public {
        // 0 = "no on-chain expiry" sentinel; otherwise any time >= now.
        if (validUntil != 0) validUntil = bound(validUntil, block.timestamp, type(uint256).max);
        bytes memory data = _data(trustedKey, validUntil);
        assertTrue(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, new bytes(64), data));
    }

    /// @notice The full decision must equal the conjunction of EVERY gate, with the sr25519 precompile
    ///         verdict treated as a fuzzed input (not hardwired true): a claim is valid iff the key is
    ///         trusted AND the signature is 64 bytes AND the credential is not revoked AND not expired
    ///         AND the precompile returns true. A wrong-direction check on any single gate fails this.
    function testFuzz_decisionMatchesAllGates(
        bool useTrusted,
        bytes32 randomKey,
        uint8 sigLen,
        uint256 validUntil,
        bool verdict,
        bool revoke
    ) public {
        vm.assume(randomKey != trustedKey);
        bytes32 key = useTrusted ? trustedKey : randomKey;
        validUntil = bound(validUntil, 0, block.timestamp * 2); // mix of expired / unexpired / sentinel-0

        // The precompile verdict is now a fuzzed input rather than a constant.
        vm.clearMockedCalls();
        vm.mockCall(SYSTEM_PRECOMPILE, abi.encodeWithSelector(ISystem.sr25519Verify.selector), abi.encode(verdict));
        if (revoke) bridge.revokeCredential(rootHash);

        bytes memory data = _data(key, validUntil);
        bool result = bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, new bytes(sigLen), data);

        bool notExpired = (validUntil == 0 || block.timestamp <= validUntil);
        bool expected = useTrusted && (sigLen == 64) && !revoke && notExpired && verdict;
        assertEq(result, expected, "decision must equal the AND of all gates");
    }
}
