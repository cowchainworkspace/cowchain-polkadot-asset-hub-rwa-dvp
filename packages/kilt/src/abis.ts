// Minimal ABIs for the on-chain demo (only the functions we call).

export const identityRegistryAbi = [
  {
    type: "function",
    name: "registerIdentity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_userAddress", type: "address" },
      { name: "_identity", type: "address" },
      { name: "_country", type: "uint16" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isVerified",
    stateMutability: "view",
    inputs: [{ name: "_userAddress", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export const tokenAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const stablecoinAbi = [
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
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
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
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "tradeId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "canSettle",
    stateMutability: "view",
    inputs: [{ name: "tradeId", type: "uint256" }],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "reason", type: "string" },
    ],
  },
  {
    type: "function",
    name: "tradeCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "TradeCreated",
    inputs: [
      { name: "tradeId", type: "uint256", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "securityToken", type: "address", indexed: false },
      { name: "securityAmount", type: "uint256", indexed: false },
      { name: "paymentToken", type: "address", indexed: false },
      { name: "paymentAmount", type: "uint256", indexed: false },
      { name: "expiry", type: "uint64", indexed: false },
    ],
  },
] as const;

export const bridgeAbi = [
  {
    type: "function",
    name: "claimSigningMessage",
    stateMutability: "view",
    inputs: [
      { name: "identity", type: "address" },
      { name: "claimTopic", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ type: "bytes" }],
  },
  {
    type: "function",
    name: "trustedAttesterKeys",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "trustAttesterKey",
    stateMutability: "nonpayable",
    inputs: [{ name: "attesterPubKey", type: "bytes32" }],
    outputs: [],
  },
] as const;
