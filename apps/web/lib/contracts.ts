import { defineChain } from "viem";

/** Polkadot Hub TestNet (chain id 420420417, token PAS). */
export const hubTestnet = defineChain({
  id: 420420417,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 18 },
  rpcUrls: { default: { http: ["https://eth-rpc-testnet.polkadot.io/"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://blockscout-testnet.polkadot.io" } },
  testnet: true,
});

export const explorer = "https://blockscout-testnet.polkadot.io";

/** Live deployment on Hub TestNet (see packages/contracts/deployments/hub-testnet.json). */
export const contracts = {
  claimTopicsRegistry: "0xe0Fd6F618250DF86b881A2eedA4507982f385251",
  trustedIssuersRegistry: "0x4cb6CfeDfb1d4E95C6948EB27863B36ed0b45Ca7",
  identityRegistryStorage: "0x8d594722fDDC6D9a641E99DE5101108A34fFA93E",
  identityRegistry: "0x9abDdcd65a59F78cdf49F87E706D89F919a3e321",
  modularCompliance: "0xE36879fd099f8e270b3719924f743A36436dE67a",
  token: "0x60670D2680D3F08139a0D8F48de8aC00aB5D5E3B",
  kiltIdentityBridge: "0xc05e4C1c314049f5396B8dE35E8052Af72d07f41",
  dvpSettlement: "0xE407A1951f0c8C958d424A32Af9492A2090c8A94",
  mockStablecoin: "0xD1732088b8eCedB3639327785f23187FB46663dF",
} as const;

export const KYC_CLAIM_TOPIC = 1n;
/** The KILT attester sr25519 public key trusted on-chain by the bridge. */
export const ATTESTER_PUBKEY = "0x3a97d61f442749678202b20a1f6e67c17cc27564d6bba4b15814493d3f93e31a";

export const erc20Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const identityRegistryAbi = [
  { type: "function", name: "isVerified", stateMutability: "view", inputs: [{ name: "u", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "contains", stateMutability: "view", inputs: [{ name: "u", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

export const claimTopicsAbi = [
  { type: "function", name: "getClaimTopics", stateMutability: "view", inputs: [], outputs: [{ type: "uint256[]" }] },
] as const;

export const bridgeAbi = [
  { type: "function", name: "trustedAttesterKeys", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const;

export const stablecoinAbi = [
  ...erc20Abi,
  { type: "function", name: "drip", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

export const tokenAdminAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isAgent",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export const dvpAbi = [
  {
    type: "function",
    name: "createTrade",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "securityToken", type: "address" },
      { name: "securityAmount", type: "uint256" },
      { name: "paymentToken", type: "address" },
      { name: "paymentAmount", type: "uint256" },
      { name: "expiry", type: "uint64" },
    ],
    outputs: [{ name: "tradeId", type: "uint256" }],
  },
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "tradeId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelTrade", stateMutability: "nonpayable", inputs: [{ name: "tradeId", type: "uint256" }], outputs: [] },
  { type: "function", name: "tradeCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "trades",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "buyer", type: "address" },
      { name: "securityToken", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "expiry", type: "uint64" },
      { name: "status", type: "uint8" },
      { name: "securityAmount", type: "uint256" },
      { name: "paymentAmount", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "canSettle",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "reason", type: "string" },
    ],
  },
] as const;

export const TRADE_STATUS = ["None", "Pending", "Settled", "Cancelled"] as const;
