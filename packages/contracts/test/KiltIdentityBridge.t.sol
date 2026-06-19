// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import { Test } from "forge-std/Test.sol";
import { KiltIdentityBridge } from "../src/KiltIdentityBridge.sol";
import { ISystem, SYSTEM_PRECOMPILE } from "../src/precompiles/ISystem.sol";
import { IIdentity } from "@onchain-id/solidity/contracts/interface/IIdentity.sol";

/**
 * @title KiltIdentityBridge unit tests
 * @notice The System precompile (0x900) does not exist on Anvil, so we mock it with `vm.mockCall`.
 *         These tests cover the bridge's decision logic (trusted key, revocation, expiry, signature
 *         length, and the precompile verdict). End-to-end sr25519 verification against the real
 *         precompile is exercised by the on-chain integration test on Polkadot Hub TestNet.
 */
contract KiltIdentityBridgeTest is Test {
    KiltIdentityBridge internal bridge;

    bytes32 internal attesterKey = bytes32(uint256(0xA77E5));
    address internal investorIdentity = address(0x1D);
    uint256 internal constant KYC_TOPIC = 1;
    bytes32 internal rootHash = keccak256("kilt-credential-root");

    function setUp() public {
        vm.warp(1_000_000); // non-zero timestamp so expiry math is meaningful
        bridge = new KiltIdentityBridge();
        bridge.trustAttesterKey(attesterKey);
        // Default: the precompile says "signature valid".
        _mockPrecompile(true);
    }

    function _mockPrecompile(bool verdict) internal {
        vm.mockCall(SYSTEM_PRECOMPILE, abi.encodeWithSelector(ISystem.sr25519Verify.selector), abi.encode(verdict));
    }

    function _data(bytes32 key, bytes32 root, uint256 validUntil) internal pure returns (bytes memory) {
        return abi.encode(key, root, validUntil);
    }

    function _sig() internal pure returns (bytes memory s) {
        s = new bytes(64); // contents irrelevant: the precompile is mocked
    }

    function test_isClaimValid_trueForTrustedKey() public {
        bytes memory data = _data(attesterKey, rootHash, block.timestamp + 1 days);
        assertTrue(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, _sig(), data));
    }

    function test_isClaimValid_falseForUntrustedKey() public {
        bytes32 untrusted = bytes32(uint256(0xBAD));
        bytes memory data = _data(untrusted, rootHash, block.timestamp + 1 days);
        assertFalse(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, _sig(), data));
    }

    function test_isClaimValid_falseWhenCredentialRevoked() public {
        bridge.revokeCredential(rootHash);
        bytes memory data = _data(attesterKey, rootHash, block.timestamp + 1 days);
        assertFalse(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, _sig(), data));
    }

    function test_isClaimValid_falseWhenExpired() public {
        bytes memory data = _data(attesterKey, rootHash, block.timestamp - 1);
        assertFalse(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, _sig(), data));
    }

    function test_isClaimValid_falseForBadSignatureLength() public {
        bytes memory data = _data(attesterKey, rootHash, block.timestamp + 1 days);
        bytes memory shortSig = new bytes(63);
        assertFalse(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, shortSig, data));
    }

    function test_isClaimValid_falseWhenPrecompileRejects() public {
        _mockPrecompile(false); // attester key trusted, but signature doesn't verify
        bytes memory data = _data(attesterKey, rootHash, block.timestamp + 1 days);
        assertFalse(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, _sig(), data));
    }

    function test_isClaimValid_neverExpiresWhenValidUntilZero() public {
        bytes memory data = _data(attesterKey, rootHash, 0);
        assertTrue(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, _sig(), data));
    }

    function test_claimSigningMessage_isDeterministicAndBound() public view {
        bytes memory data = _data(attesterKey, rootHash, block.timestamp + 1 days);
        bytes memory expected = abi.encode(block.chainid, address(bridge), investorIdentity, KYC_TOPIC, data);
        assertEq(bridge.claimSigningMessage(IIdentity(investorIdentity), KYC_TOPIC, data), expected);
    }

    function test_onlyOwnerCanManageTrust() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("Ownable: caller is not the owner"));
        bridge.trustAttesterKey(bytes32(uint256(1)));
    }

    function test_renounceOwnership_isDisabled() public {
        vm.expectRevert(KiltIdentityBridge.OwnershipCannotBeRenounced.selector);
        bridge.renounceOwnership();
    }

    function test_trustAttesterKey_rejectsZeroKey() public {
        vm.expectRevert(KiltIdentityBridge.ZeroKey.selector);
        bridge.trustAttesterKey(bytes32(0));
    }

    /// @notice Pins the on-chain message reconstruction (isClaimValid) to claimSigningMessage's encoding:
    ///         the full-calldata mock returns true ONLY if 0x900 is called with EXACTLY the expected message.
    function test_isClaimValid_pinsMessageReconstruction() public {
        bytes memory data = _data(attesterKey, rootHash, block.timestamp + 1 days);
        bytes memory sig = new bytes(64); // all zero
        uint8[64] memory sigArr; // all zero, matches `sig` after repacking
        bytes memory expectedMessage = abi.encode(block.chainid, address(bridge), investorIdentity, KYC_TOPIC, data);

        vm.clearMockedCalls();
        vm.mockCall(
            SYSTEM_PRECOMPILE,
            abi.encodeWithSelector(ISystem.sr25519Verify.selector, sigArr, expectedMessage, attesterKey),
            abi.encode(true)
        );

        // If isClaimValid reconstructed a different message, the mock would not match and the real (codeless)
        // 0x900 call would revert — so a true result proves byte-for-byte equivalence.
        assertTrue(bridge.isClaimValid(IIdentity(investorIdentity), KYC_TOPIC, sig, data));
    }
}
