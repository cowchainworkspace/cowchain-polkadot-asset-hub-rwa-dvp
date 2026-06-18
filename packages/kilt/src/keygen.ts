import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, mnemonicGenerate } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { readFileSync, writeFileSync } from "node:fs";
import { ENV_PATH } from "./config.js";

/**
 * Generates (or reuses) the KILT attester sr25519 keypair.
 *
 * The SAME keypair serves two roles:
 *   1. its 32-byte public key is what the on-chain KiltIdentityBridge trusts and verifies
 *      via the System precompile (0x900);
 *   2. its SS58 account is the KILT (Peregrine) account that anchors attestations — fund it
 *      at https://faucet.kilt.io/ (100 PILT).
 *
 * Writes KILT_ATTESTER_MNEMONIC + KILT_ATTESTER_SR25519_PUBKEY to the root .env (gitignored).
 */
async function main(): Promise<void> {
  await cryptoWaitReady();

  const existing = process.env.KILT_ATTESTER_MNEMONIC?.trim();
  const mnemonic = existing && existing.length > 0 ? existing : mnemonicGenerate();
  const reused = Boolean(existing && existing.length > 0);

  // KILT uses SS58 prefix 38.
  const keyring = new Keyring({ type: "sr25519", ss58Format: 38 });
  const pair = keyring.addFromMnemonic(mnemonic);
  const pubHex = u8aToHex(pair.publicKey); // 0x + 32 bytes

  console.log(`KILT attester sr25519 keypair (${reused ? "reused from .env" : "newly generated"}):`);
  console.log("  SS58 address  :", pair.address, "  <-- fund at https://faucet.kilt.io/");
  console.log("  sr25519 pubkey:", pubHex, "  <-- the bridge trusts this key");
  console.log("  mnemonic      : (written to .env, not printed)");

  updateEnv({ KILT_ATTESTER_MNEMONIC: mnemonic, KILT_ATTESTER_SR25519_PUBKEY: pubHex });
  console.log(`\nUpdated ${ENV_PATH}`);
  console.log("Next: on-chain, call bridge.trustAttesterKey(<pubkey>) so claims it signs are accepted.");
}

function updateEnv(vars: Record<string, string>): void {
  let content = readFileSync(ENV_PATH, "utf8");
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    content = re.test(content) ? content.replace(re, `${k}=${v}`) : `${content}\n${k}=${v}`;
  }
  writeFileSync(ENV_PATH, content.endsWith("\n") ? content : content + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
