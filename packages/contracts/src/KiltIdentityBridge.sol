// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IIdentity} from "@onchain-id/solidity/contracts/interface/IIdentity.sol";
import {ISystem, SYSTEM_PRECOMPILE} from "./precompiles/ISystem.sol";

/**
 * @title  KiltIdentityBridge
 * @author Cowchain
 * @notice Lets an UNMODIFIED ERC-3643 / T-REX `IdentityRegistry` accept KYC claims that
 *         were attested off-chain as KILT verifiable credentials — by verifying the KILT
 *         attester's **sr25519** signature **on-chain** through Polkadot Hub's System
 *         precompile (`0x0000…0900`, {ISystem-sr25519Verify}).
 *
 *         This is the project's identity-bridge centerpiece. It demonstrates that a
 *         Substrate-native credential (KILT) can gate a Solidity security token natively on
 *         Polkadot Hub, with no trusted EVM relayer signing in the hot path and no changes
 *         to the audited Tokeny suite.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  HOW IT PLUGS INTO T-REX (zero changes to the audited contracts)
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  This contract is registered in the T-REX `TrustedIssuersRegistry` as a trusted claim
 *  issuer for the KYC claim topic. On every transfer the token calls
 *  `IdentityRegistry.isVerified(to)`, which — for each required claim topic — looks up the
 *  claim stored on the investor's ONCHAINID (keyed by `keccak256(abi.encode(thisBridge,
 *  topic))`) and calls, inside a try/catch:
 *
 *      IClaimIssuer(issuer).isClaimValid(investorIdentity, topic, sig, data)
 *
 *  `issuer` resolves to THIS contract, so the only function T-REX ever calls here is
 *  {isClaimValid}. We therefore implement exactly that selector (plus admin + revocation)
 *  and deliberately omit the rest of the ONCHAINID / ERC-734 / ERC-735 surface — keeping the
 *  star contract small and auditable. (It is registered via `IClaimIssuer(address(bridge))`.)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  CLAIM ENCODING — what the off-chain KILT attester signs, and what the ONCHAINID stores
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *      data    = abi.encode(bytes32 attesterPubKey, bytes32 kiltCredentialRootHash, uint256 validUntil)
 *      message = abi.encode(block.chainid, address(this), address(investorIdentity), claimTopic, data)
 *      sig     = sr25519_sign(attesterSecretKey, message)            // 64 bytes
 *
 *  The investor's ONCHAINID stores an ERC-735 claim {topic, scheme, issuer = this, sig, data}.
 *  `message` binds the credential to THIS chain, THIS bridge, THIS identity and THIS topic, so
 *  a signature cannot be replayed onto another chain, bridge, investor or claim topic. Call
 *  {claimSigningMessage} off-chain (eth_call) to obtain the canonical bytes to sign — this
 *  removes any risk of an ABI-encoding mismatch between the attester service and the chain.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  TRUST MODEL (stated honestly)
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  On-chain we cryptographically prove the claim was signed by a *trusted KILT attester key*.
 *  We do NOT prove on-chain that the underlying KILT attestation is still live and unrevoked
 *  on the KILT chain — that needs a KILT-chain lookup (KILT's DIP light-client / their
 *  forthcoming EVM SDK / an XCM query to People Chain), which no single contract can do today.
 *  Revocation and credential-liveness are therefore enforced by an off-chain watcher that
 *  calls {revokeCredential} (by KILT credential root hash) or {untrustAttesterKey}. The KILT
 *  default ecdsa key type is NOT EVM-`ecrecover`-compatible (it Blake2-prehashes), which is
 *  exactly why we verify the sr25519 key via the Polkadot-native precompile instead.
 */
contract KiltIdentityBridge is Ownable2Step {
    /// @notice sr25519 public keys (32 bytes) of the KILT attesters this bridge trusts.
    mapping(bytes32 => bool) public trustedAttesterKeys;

    /// @notice KILT credential root hashes flagged as revoked by the off-chain watcher.
    mapping(bytes32 => bool) public revokedCredentialRoots;

    event AttesterKeyTrusted(bytes32 indexed attesterPubKey);
    event AttesterKeyUntrusted(bytes32 indexed attesterPubKey);
    event CredentialRevoked(bytes32 indexed kiltCredentialRootHash);

    // ──────────────────────────────────────────────────────────────────────────────────────
    //  Admin — manage the trusted attester set and revocations
    // ──────────────────────────────────────────────────────────────────────────────────────

    /// @notice Disabled: renouncing ownership would permanently freeze the trusted-attester set and the
    ///         revocation list with no way to rotate. Use {transferOwnership} (two-step) to hand over admin.
    function renounceOwnership() public view override onlyOwner {
        revert("bridge: ownership cannot be renounced");
    }

    /// @notice Trust a KILT attester's sr25519 public key. Claims it signs become acceptable.
    function trustAttesterKey(bytes32 attesterPubKey) external onlyOwner {
        require(attesterPubKey != bytes32(0), "bridge: zero key");
        trustedAttesterKeys[attesterPubKey] = true;
        emit AttesterKeyTrusted(attesterPubKey);
    }

    /// @notice Stop trusting an attester key (e.g. key rotation or compromise).
    function untrustAttesterKey(bytes32 attesterPubKey) external onlyOwner {
        trustedAttesterKeys[attesterPubKey] = false;
        emit AttesterKeyUntrusted(attesterPubKey);
    }

    /// @notice Mark a KILT credential (by its on-chain root hash) revoked; {isClaimValid}
    ///         will then reject it, which in turn makes `isVerified` fail and blocks transfers.
    function revokeCredential(bytes32 kiltCredentialRootHash) external onlyOwner {
        revokedCredentialRoots[kiltCredentialRootHash] = true;
        emit CredentialRevoked(kiltCredentialRootHash);
    }

    // ──────────────────────────────────────────────────────────────────────────────────────
    //  Canonical signing message — call off-chain to avoid encoding drift
    // ──────────────────────────────────────────────────────────────────────────────────────

    /// @notice The exact bytes a KILT attester must sr25519-sign for {isClaimValid} to accept
    ///         a claim with this `data` on `identity`/`claimTopic`.
    function claimSigningMessage(IIdentity identity, uint256 claimTopic, bytes calldata data)
        public
        view
        returns (bytes memory)
    {
        return abi.encode(block.chainid, address(this), address(identity), claimTopic, data);
    }

    // ──────────────────────────────────────────────────────────────────────────────────────
    //  The one function T-REX's IdentityRegistry.isVerified() calls on a trusted issuer
    // ──────────────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns true iff `sig` is a current, non-revoked KILT KYC attestation for
     *         `identity`, signed by a trusted attester key.
     * @dev    Selector equals `IClaimIssuer.isClaimValid(IIdentity,uint256,bytes,bytes)` so the
     *         unmodified T-REX registry dispatches to it. `view`, and it staticcalls the System
     *         precompile — which only exists on Polkadot Hub (mock `0x900` in unit tests).
     * @param  identity   the investor's ONCHAINID (bound into the signed message)
     * @param  claimTopic the KYC claim topic (bound into the signed message)
     * @param  sig        the 64-byte sr25519 signature stored on the ONCHAINID claim
     * @param  data       abi.encode(bytes32 attesterPubKey, bytes32 kiltCredentialRootHash, uint256 validUntil)
     */
    function isClaimValid(IIdentity identity, uint256 claimTopic, bytes calldata sig, bytes calldata data)
        external
        view
        returns (bool)
    {
        if (sig.length != 64) return false;

        (bytes32 attesterPubKey, bytes32 kiltCredentialRootHash, uint256 validUntil) =
            abi.decode(data, (bytes32, bytes32, uint256));

        if (!trustedAttesterKeys[attesterPubKey]) return false;
        if (revokedCredentialRoots[kiltCredentialRootHash]) return false;
        // validUntil == 0 is a deliberate "no on-chain expiry" sentinel; production attesters should set
        // a bounded validUntil so credential liveness does not rely solely on off-chain revocation.
        if (validUntil != 0 && block.timestamp > validUntil) return false;

        // Repack the 64-byte signature into the uint8[64] ABI shape the precompile expects.
        uint8[64] memory signature;
        for (uint256 i = 0; i < 64; ++i) {
            signature[i] = uint8(sig[i]);
        }

        // NOTE: intentionally NOT internally guarded. On a chain without the 0x900 precompile this
        // staticcall reverts (and the abi.decode above reverts on malformed data) — by design: T-REX
        // IdentityRegistry.isVerified calls this inside a try/catch and treats any revert as "not
        // verified" (fail-closed). Do not call isClaimValid directly on a precompile-less chain.
        // Reconstruct the exact message the attester signed and verify it natively on Hub.
        bytes memory message = abi.encode(block.chainid, address(this), address(identity), claimTopic, data);
        return ISystem(SYSTEM_PRECOMPILE).sr25519Verify(signature, message, attesterPubKey);
    }
}
