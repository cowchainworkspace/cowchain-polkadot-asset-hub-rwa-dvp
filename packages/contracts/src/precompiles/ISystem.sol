// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

// Fixed address of the Polkadot Hub "System" precompile (pallet-revive builtin):
// 0x0000000000000000000000000000000000000900
address constant SYSTEM_PRECOMPILE = address(0x900);

/**
 * @title  ISystem
 * @notice Minimal interface to Polkadot Hub's "System" precompile — a pallet-revive
 *         builtin that exposes Substrate-native cryptography and runtime utilities to
 *         Solidity. We use `sr25519Verify` to verify a KILT attester's sr25519 signature
 *         on-chain (see {KiltIdentityBridge}).
 *
 * @dev    Source of truth: docs.polkadot.com/smart-contracts/precompiles/system and
 *         paritytech/polkadot-sdk → substrate/frame/revive/src/precompiles/builtin/system.rs
 *         (precompile address `0x900`, verified June 2026).
 *
 *         IMPORTANT: this precompile only exists on Polkadot Hub. On a vanilla EVM (e.g.
 *         the Anvil node `forge test` runs against) address `0x900` has no code, so calls
 *         revert. Unit tests must mock it; integration tests run against the live testnet.
 *         Treat this ABI as load-bearing and smoke-test it on-chain before relying on it —
 *         if it ever changes, only this file and the single call site need updating.
 */
interface ISystem {
    /**
     * @notice Verify an sr25519 (schnorrkel) signature.
     * @param  signature the 64-byte sr25519 signature, passed as 64 individual bytes
     * @param  message   the exact message bytes that were signed (NOT a hash; schnorrkel
     *                    handles its own internal hashing/transcript)
     * @param  publicKey the signer's 32-byte sr25519 public key
     * @return valid     true iff `signature` is valid for (`message`, `publicKey`)
     */
    function sr25519Verify(uint8[64] calldata signature, bytes calldata message, bytes32 publicKey)
        external
        view
        returns (bool valid);

    /**
     * @notice Convert an EVM (H160) address to its 32-byte Substrate AccountId.
     * @dev    Not used by the bridge today, but documents the precompile's identity-bridging
     *         capability for future on-chain Polkadot-identity work.
     */
    function toAccountId(address input) external view returns (bytes memory accountId);
}
