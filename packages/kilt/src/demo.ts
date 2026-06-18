/**
 * CAPSTONE DEMO — the full institutional RWA lifecycle, on-chain on Polkadot Hub TestNet.
 *
 *   1. Onboard an issuer and an investor: deploy each an ONCHAINID, attach a KYC claim whose
 *      signature is a KILT attester sr25519 signature (verified on-chain by the bridge via 0x900),
 *      then registerIdentity — and watch isVerified() flip to true.
 *   2. Prove compliance: minting the security token to an UNVERIFIED address reverts.
 *   3. Issue the bond to the verified issuer; give the investor cash.
 *   4. Execute an ATOMIC DvP: bond ⇄ cash in one transaction. Both legs settle or neither does.
 *
 * Run: pnpm --filter @cowchain/kilt demo
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  formatUnits,
  keccak256,
  toHex,
  encodeAbiParameters,
  decodeEventLog,
  BaseError,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { Keyring } from "@polkadot/keyring";
import type { KeyringPair } from "@polkadot/keyring/types";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hubTestnet, RPC_URL, ROOT_DIR, loadDeployments } from "./config.js";
import { buildClaimData, signCanonicalMessage } from "./claim.js";
import { identityRegistryAbi, tokenAbi, stablecoinAbi, dvpAbi, bridgeAbi } from "./abis.js";

const KYC_TOPIC = 1n;
const BOND_AMOUNT = parseUnits("100", 18); // 100 cBOND
const PRICE = parseUnits("1000", 6); // 1,000 mUSD

// ONCHAINID Identity deployable artifact (abi + bytecode)
const idArtifact = JSON.parse(
  readFileSync(
    resolve(ROOT_DIR, "packages/contracts/node_modules/@onchain-id/solidity/artifacts/contracts/Identity.sol/Identity.json"),
    "utf8",
  ),
);
const IDENTITY_ABI = idArtifact.abi;
const IDENTITY_BYTECODE = idArtifact.bytecode as Hex;

const d = loadDeployments();
const pub = createPublicClient({ chain: hubTestnet, transport: http(RPC_URL) });

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

const deployer = privateKeyToAccount(req("HUB_DEPLOYER_PRIVATE_KEY") as Hex);
const deployerWC = createWalletClient({ account: deployer, chain: hubTestnet, transport: http(RPC_URL) });

async function waitOk(label: string, hash: Hex): Promise<void> {
  // Wait 2 confirmations: the young Hub eth-rpc can return an optimistic receipt for the latest block
  // whose status is later corrected on finalization.
  const r = await pub.waitForTransactionReceipt({ hash, confirmations: 2 });
  console.log(`    ${label}: ${r.status}  ${hash}`);
  if (r.status !== "success") throw new Error(`${label} reverted`);
}

/** Deploy an ONCHAINID for `wallet` (managed by the deployer), attach a KILT-signed KYC claim, register it. */
async function onboard(wallet: Address, label: string, attester: KeyringPair, attesterPubKey: Hex): Promise<Address> {
  console.log(`\n[onboard ${label}] ${wallet}`);

  // 1) deploy the identity (deployer is its management key)
  const deployHash = await deployerWC.deployContract({
    abi: IDENTITY_ABI,
    bytecode: IDENTITY_BYTECODE,
    args: [deployer.address, false],
  });
  const deployRcpt = await pub.waitForTransactionReceipt({ hash: deployHash });
  const identity = deployRcpt.contractAddress as Address;
  console.log(`    ONCHAINID: ${identity}`);

  // 2) give the deployer a CLAIM key (purpose 3) on this identity so it can addClaim.
  //    ERC-734 key id = keccak256(abi.encode(address)) — match Solidity exactly via encodeAbiParameters.
  const claimKey = keccak256(encodeAbiParameters([{ type: "address" }], [deployer.address]));
  await waitOk(
    "addKey(CLAIM)",
    await deployerWC.writeContract({ address: identity, abi: IDENTITY_ABI, functionName: "addKey", args: [claimKey, 3n, 1n] }),
  );

  // 3) build the claim data + obtain the canonical message from the bridge, then sr25519-sign it
  const rootHash = keccak256(toHex(`kilt-credential:${identity}`));
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
  const data = buildClaimData(attesterPubKey, rootHash, validUntil);
  const message = (await pub.readContract({
    address: d.kiltIdentityBridge,
    abi: bridgeAbi,
    functionName: "claimSigningMessage",
    args: [identity, KYC_TOPIC, data],
  })) as Hex;
  const signature = signCanonicalMessage(attester, message);

  // 4) attach the claim (issuer = the bridge; scheme 1)
  await waitOk(
    "addClaim",
    await deployerWC.writeContract({
      address: identity,
      abi: IDENTITY_ABI,
      functionName: "addClaim",
      args: [KYC_TOPIC, 1n, d.kiltIdentityBridge, signature, data, ""],
    }),
  );

  // 5) register the wallet -> identity in the IdentityRegistry (country 840 = US)
  await waitOk(
    "registerIdentity",
    await deployerWC.writeContract({
      address: d.identityRegistry,
      abi: identityRegistryAbi,
      functionName: "registerIdentity",
      args: [wallet, identity, 840],
    }),
  );

  const verified = await pub.readContract({
    address: d.identityRegistry,
    abi: identityRegistryAbi,
    functionName: "isVerified",
    args: [wallet],
  });
  console.log(`    isVerified(${wallet.slice(0, 10)}…) = ${verified}`);
  if (!verified) throw new Error(`${label} not verified after onboarding`);
  return identity;
}

async function main(): Promise<void> {
  await cryptoWaitReady();
  const keyring = new Keyring({ type: "sr25519", ss58Format: 38 });
  const attester = keyring.addFromMnemonic(req("KILT_ATTESTER_MNEMONIC"));
  const attesterPubKey = u8aToHex(attester.publicKey) as Hex;
  console.log(`Attester sr25519 pubkey: ${attesterPubKey}`);

  // Ensure the bridge trusts this attester key. The documented run order (deploy -> keygen -> demo) means
  // the deploy step did not know the key yet, so trust it now — the deployer owns the bridge. Without this,
  // ONCHAINID's addClaim (which re-validates the claim through the bridge) would revert with "invalid claim".
  const trusted = (await pub.readContract({
    address: d.kiltIdentityBridge,
    abi: bridgeAbi,
    functionName: "trustedAttesterKeys",
    args: [attesterPubKey],
  })) as boolean;
  if (!trusted) {
    console.log("Attester key not yet trusted on the bridge — trusting it now...");
    await waitOk(
      "trustAttesterKey",
      await deployerWC.writeContract({
        address: d.kiltIdentityBridge,
        abi: bridgeAbi,
        functionName: "trustAttesterKey",
        args: [attesterPubKey],
      }),
    );
  }

  // Fresh parties each run (avoids "identity already registered" on re-runs)
  const issuer = privateKeyToAccount(generatePrivateKey());
  const investor = privateKeyToAccount(generatePrivateKey());
  const issuerWC = createWalletClient({ account: issuer, chain: hubTestnet, transport: http(RPC_URL) });
  const investorWC = createWalletClient({ account: investor, chain: hubTestnet, transport: http(RPC_URL) });
  console.log(`Issuer:   ${issuer.address}`);
  console.log(`Investor: ${investor.address}`);

  // ---- 1) Onboarding ----
  await onboard(issuer.address, "issuer", attester, attesterPubKey);
  await onboard(investor.address, "investor", attester, attesterPubKey);

  // ---- 2) Compliance proof: minting to an UNVERIFIED address must revert ----
  console.log("\n[compliance] mint security token to an UNVERIFIED address (must revert)...");
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  let blocked = false;
  try {
    const h = await deployerWC.writeContract({ address: d.token, abi: tokenAbi, functionName: "mint", args: [stranger, 1n] });
    await pub.waitForTransactionReceipt({ hash: h });
  } catch (e) {
    // Only an on-chain execution revert proves the compliance gate; rethrow infra errors (RPC/timeout/nonce)
    // so they are not silently misread as a successful compliance block.
    const isRevert =
      e instanceof BaseError &&
      !!e.walk((err) => err instanceof ContractFunctionRevertedError || err instanceof ExecutionRevertedError);
    if (isRevert) blocked = true;
    else throw e;
  }
  console.log(`    -> ${blocked ? "REVERTED — compliance enforced at the token level " : "SUCCEEDED — BUG!"}`);
  if (!blocked) throw new Error("compliance gate failed: mint to unverified address succeeded");

  // ---- 3) Fund parties (gas), issue the bond to the issuer, give the investor cash ----
  console.log("\n[fund] sending PAS for gas + issuing assets...");
  await waitOk("fund issuer (PAS)", await deployerWC.sendTransaction({ to: issuer.address, value: parseEther("20") }));
  await waitOk("fund investor (PAS)", await deployerWC.sendTransaction({ to: investor.address, value: parseEther("20") }));
  await waitOk("mint bond -> issuer", await deployerWC.writeContract({ address: d.token, abi: tokenAbi, functionName: "mint", args: [issuer.address, BOND_AMOUNT] }));
  await waitOk("mint cash -> investor", await deployerWC.writeContract({ address: d.mockStablecoin, abi: stablecoinAbi, functionName: "mint", args: [investor.address, PRICE] }));

  // ---- 4) Atomic DvP ----
  console.log("\n[dvp] creating trade + approvals...");
  const createHash = await issuerWC.writeContract({
    address: d.dvpSettlement,
    abi: dvpAbi,
    functionName: "createTrade",
    args: [investor.address, d.token, BOND_AMOUNT, d.mockStablecoin, PRICE, 0n],
  });
  const createRcpt = await pub.waitForTransactionReceipt({ hash: createHash });
  console.log(`    createTrade: ${createRcpt.status}  ${createHash}`);
  if (createRcpt.status !== "success") throw new Error("createTrade reverted");
  // Bind tradeId to THIS trade via its event, not the global counter (avoids a TOCTOU under concurrency).
  let tradeId: bigint | undefined;
  for (const log of createRcpt.logs) {
    if (log.address.toLowerCase() !== d.dvpSettlement.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: dvpAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "TradeCreated") {
        tradeId = (ev.args as { tradeId: bigint }).tradeId;
        break;
      }
    } catch {
      // not the TradeCreated event
    }
  }
  if (tradeId === undefined) throw new Error("TradeCreated event not found in receipt");
  console.log(`    tradeId = ${tradeId}`);
  await waitOk("issuer approves bond", await issuerWC.writeContract({ address: d.token, abi: tokenAbi, functionName: "approve", args: [d.dvpSettlement, BOND_AMOUNT] }));
  await waitOk("investor approves cash", await investorWC.writeContract({ address: d.mockStablecoin, abi: stablecoinAbi, functionName: "approve", args: [d.dvpSettlement, PRICE] }));

  const [ok, reason] = (await pub.readContract({ address: d.dvpSettlement, abi: dvpAbi, functionName: "canSettle", args: [tradeId] })) as [boolean, string];
  console.log(`    canSettle = ${ok}${reason ? ` (${reason})` : ""}`);

  console.log("\n[dvp] settling atomically (bond <-> cash in one tx)...");
  await waitOk("settle", await investorWC.writeContract({ address: d.dvpSettlement, abi: dvpAbi, functionName: "settle", args: [tradeId] }));

  // Verify the FINALIZED state, not just the receipt: a settled trade is no longer settleable. This
  // catches a false-success receipt (the testnet eth-rpc occasionally returns one) instead of trusting it.
  const [stillSettleable, why] = (await pub.readContract({
    address: d.dvpSettlement,
    abi: dvpAbi,
    functionName: "canSettle",
    args: [tradeId],
  })) as [boolean, string];
  if (stillSettleable) {
    throw new Error(
      `settle did not take effect: trade ${tradeId} is still settleable (${why}). The testnet RPC likely returned a false-success receipt — re-run the demo.`,
    );
  }

  const issuerCash = (await pub.readContract({ address: d.mockStablecoin, abi: stablecoinAbi, functionName: "balanceOf", args: [issuer.address] })) as bigint;
  const investorBond = (await pub.readContract({ address: d.token, abi: tokenAbi, functionName: "balanceOf", args: [investor.address] })) as bigint;

  console.log("\n===== RESULT =====");
  console.log(`  issuer received   : ${formatUnits(issuerCash, 6)} mUSD   (expected 1000)`);
  console.log(`  investor received : ${formatUnits(investorBond, 18)} cBOND  (expected 100)`);
  if (issuerCash !== PRICE || investorBond !== BOND_AMOUNT) throw new Error("settlement balances unexpected");
  console.log("\nPASS: full lifecycle (KILT-verified onboarding -> issuance -> atomic DvP) settled on Polkadot Hub.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
