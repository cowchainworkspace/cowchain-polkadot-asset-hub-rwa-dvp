import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { stringToU8a } from "@polkadot/util";
import { createPublicClient, http, toHex, type PublicClient } from "viem";
import { hubTestnet, RPC_URL, SYSTEM_PRECOMPILE } from "./config.js";

/**
 * DEFINITIVE on-chain test of the System precompile's sr25519Verify (0x900).
 *
 * The Foundry unit tests can only MOCK 0x900 (it doesn't exist on Anvil). This script does the
 * real thing: produce a genuine sr25519 signature with @polkadot/keyring (the same library the
 * KILT attester uses), then ask the LIVE Hub precompile to verify it. It must return:
 *   - true  for the correct (message, signature, pubkey)
 *   - false for a tampered message
 * If both hold, the whole KiltIdentityBridge approach (Substrate-native signature verified on an
 * EVM contract) is proven end-to-end.
 */
const ISystemAbi = [
  {
    type: "function",
    name: "sr25519Verify",
    stateMutability: "view",
    inputs: [
      { name: "signature", type: "uint8[64]" },
      { name: "message", type: "bytes" },
      { name: "publicKey", type: "bytes32" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
  },
] as const;

async function verify(
  client: PublicClient,
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  return client.readContract({
    address: SYSTEM_PRECOMPILE,
    abi: ISystemAbi,
    functionName: "sr25519Verify",
    args: [Array.from(signature), toHex(message), toHex(publicKey)],
  }) as Promise<boolean>;
}

async function main(): Promise<void> {
  await cryptoWaitReady();
  const keyring = new Keyring({ type: "sr25519" });
  const pair = keyring.addFromUri("//cowchain-precompile-probe");

  const message = stringToU8a("cowchain sr25519 precompile probe");
  const signature = pair.sign(message); // genuine 64-byte sr25519 signature

  const client = createPublicClient({ chain: hubTestnet, transport: http(RPC_URL) });

  const okValid = await verify(client, signature, message, pair.publicKey);
  console.log(`valid    (correct msg/sig/key) -> sr25519Verify = ${okValid}   ${okValid === true ? "PASS" : "FAIL"}`);

  const tampered = stringToU8a("cowchain sr25519 precompile probe!");
  const okTampered = await verify(client, signature, tampered, pair.publicKey);
  console.log(`tampered (wrong message)       -> sr25519Verify = ${okTampered}  ${okTampered === false ? "PASS" : "FAIL"}`);

  if (okValid !== true || okTampered !== false) {
    console.error("\nFAILED: the live precompile did not behave as expected — investigate ABI / signing context.");
    process.exit(1);
  }
  console.log("\nPASS: KILT sr25519 signatures verify on-chain via 0x900. The bridge approach is proven end-to-end.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
