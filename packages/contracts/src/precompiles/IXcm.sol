// SPDX-License-Identifier: MIT
// Pragma relaxed to ^0.8.17 to match this repo's pinned solc; the canonical source uses ^0.8.20.
pragma solidity ^0.8.17;

// Fixed address of the Polkadot Hub XCM precompile (cross-consensus messaging):
// 0x00000000000000000000000000000000000a0000
address constant XCM_PRECOMPILE_ADDRESS = address(0xA0000);

/**
 * @title  IXcm
 * @notice Canonical interface to Polkadot Hub's XCM precompile — the cross-border / cross-parachain
 *         settlement primitive. Verbatim from paritytech/polkadot-sdk:
 *         polkadot/xcm/pallet-xcm/precompiles/src/interface/IXcm.sol.
 *
 * @dev    Low-level by design: `message` is a SCALE-encoded VersionedXcm program and `destination`
 *         is a SCALE-encoded Location, both produced off-chain (e.g. with PAPI / the polkadot-api
 *         library). There is no Solidity-native Location type and no convenience transferAssets — build the
 *         XCM program off-chain, weigh it, then `execute` (same chain) or `send` (cross-chain).
 *
 *         CROSS-BORDER DvP: the cash leg of a settlement can be an XCM transfer to a counterparty on
 *         another parachain, composed with the on-Hub ERC-3643 delivery leg. This interface + the
 *         `probe-xcm` script (packages/kilt) demonstrate the precompile is live and callable on Hub;
 *         a full cross-parachain settlement additionally requires a destination chain to settle on.
 */
interface IXcm {
    /// @dev XCM v2 weight: `refTime` = compute on reference hardware, `proofSize` = state-proof size.
    struct Weight {
        uint64 refTime;
        uint64 proofSize;
    }

    /// @notice Execute a SCALE-encoded XCM program locally, bounded by `weight`.
    function execute(bytes calldata message, Weight calldata weight) external;

    /// @notice Send a SCALE-encoded XCM program to a SCALE-encoded destination Location.
    function send(bytes calldata destination, bytes calldata message) external;

    /// @notice Estimate the Weight required to execute `message`.
    function weighMessage(bytes calldata message) external view returns (Weight memory weight);
}
