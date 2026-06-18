import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { Address } from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Monorepo root (…/packages/kilt/src → up 3). */
export const ROOT_DIR = resolve(__dirname, "../../..");
export const ENV_PATH = resolve(ROOT_DIR, ".env");

loadEnv({ path: ENV_PATH });

export const RPC_URL = process.env.HUB_TESTNET_RPC_URL ?? "https://eth-rpc-testnet.polkadot.io/";
export const CHAIN_ID = Number(process.env.HUB_TESTNET_CHAIN_ID ?? 420420417);

/** Polkadot Hub System precompile (sr25519Verify lives here). */
export const SYSTEM_PRECOMPILE: Address = "0x0000000000000000000000000000000000000900";

/** viem chain definition for Polkadot Hub TestNet. */
export const hubTestnet = {
  id: CHAIN_ID,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

export interface Deployments {
  chainId: number;
  deployer: Address;
  kycClaimTopic: number;
  claimTopicsRegistry: Address;
  trustedIssuersRegistry: Address;
  identityRegistryStorage: Address;
  identityRegistry: Address;
  modularCompliance: Address;
  token: Address;
  kiltIdentityBridge: Address;
  dvpSettlement: Address;
  mockStablecoin: Address;
}

export function loadDeployments(): Deployments {
  const p = resolve(ROOT_DIR, "packages/contracts/deployments/hub-testnet.json");
  const d = JSON.parse(readFileSync(p, "utf8")) as Deployments;
  if (d.chainId !== CHAIN_ID) {
    throw new Error(
      `Chain mismatch: deployments chainId=${d.chainId} but configured CHAIN_ID=${CHAIN_ID}. ` +
        `Check HUB_TESTNET_CHAIN_ID in .env vs packages/contracts/deployments/hub-testnet.json.`,
    );
  }
  return d;
}
