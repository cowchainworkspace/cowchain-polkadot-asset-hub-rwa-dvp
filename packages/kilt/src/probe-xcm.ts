import { createPublicClient, http } from "viem";
import { hubTestnet, RPC_URL } from "./config.js";

/**
 * Liveness probe for the XCM precompile (0xA0000) — the cross-border settlement primitive.
 * Calls `weighMessage` with a sample SCALE-encoded XCM program (from docs.polkadot.com). A returned
 * Weight proves the precompile is live and callable on Hub; this is the foundation a cross-parachain
 * DvP cash leg would build on (the on-Hub ERC-3643 delivery leg is already proven).
 */
const XCM_PRECOMPILE = "0x00000000000000000000000000000000000a0000" as const;

const IXcmAbi = [
  {
    type: "function",
    name: "weighMessage",
    stateMutability: "view",
    inputs: [{ name: "message", type: "bytes" }],
    outputs: [
      {
        name: "weight",
        type: "tuple",
        components: [
          { name: "refTime", type: "uint64" },
          { name: "proofSize", type: "uint64" },
        ],
      },
    ],
  },
] as const;

// Sample encoded XCM (WithdrawAsset + BuyExecution + DepositAsset) from the official docs.
const SAMPLE_XCM =
  "0x050c000401000003008c86471301000003008c8647000d010101000000010100368e8759910dab756d344995f1d3c79374ca8f70066d3a709e48029f6bf0ee7e";

async function main(): Promise<void> {
  const client = createPublicClient({ chain: hubTestnet, transport: http(RPC_URL) });
  try {
    const w = (await client.readContract({
      address: XCM_PRECOMPILE,
      abi: IXcmAbi,
      functionName: "weighMessage",
      args: [SAMPLE_XCM],
    })) as { refTime: bigint; proofSize: bigint };
    console.log(`XCM precompile weighMessage -> refTime=${w.refTime}, proofSize=${w.proofSize}`);
    if (w.refTime > 0n || w.proofSize > 0n) {
      console.log("PASS: XCM precompile (0xA0000) is live and callable on Polkadot Hub.");
    } else {
      console.log("Precompile responded but returned zero weight (sample message may need updating).");
    }
  } catch (e) {
    console.error("weighMessage call failed:", (e as Error).message.split("\n")[0]);
    console.error("(The precompile may be gated on this runtime, or the sample message needs re-encoding.)");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
