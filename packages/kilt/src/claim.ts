import { encodeAbiParameters, hexToBytes, type Hex } from "viem";
import { u8aToHex } from "@polkadot/util";
import type { KeyringPair } from "@polkadot/keyring/types";

/**
 * Builds the ERC-735 claim `data` field the KiltIdentityBridge expects:
 *   data = abi.encode(bytes32 attesterPubKey, bytes32 kiltCredentialRootHash, uint256 validUntil)
 */
export function buildClaimData(attesterPubKey: Hex, kiltCredentialRootHash: Hex, validUntil: bigint): Hex {
  return encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
    [attesterPubKey, kiltCredentialRootHash, validUntil],
  );
}

/**
 * sr25519-signs the canonical message obtained from `bridge.claimSigningMessage(identity, topic, data)`.
 * Calling the on-chain view to get the exact bytes (rather than re-encoding here) eliminates any
 * ABI-encoding drift between this attester and the contract.
 *
 * @returns the 64-byte sr25519 signature as 0x-hex, to store in the ONCHAINID claim's `signature`.
 */
export function signCanonicalMessage(pair: KeyringPair, canonicalMessage: Hex): Hex {
  const signature = pair.sign(hexToBytes(canonicalMessage));
  if (signature.length !== 64) {
    throw new Error(`expected 64-byte sr25519 signature, got ${signature.length}`);
  }
  return u8aToHex(signature) as Hex;
}
