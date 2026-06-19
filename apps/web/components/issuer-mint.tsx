"use client";

import { useState } from "react";
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { isAddress, parseUnits } from "viem";
import { contracts, hubTestnet, identityRegistryAbi, tokenAdminAbi } from "@/lib/contracts";
import { Badge, Button, Card } from "./ui";

/**
 * Primary issuance: mint the security token. ERC-3643 enforces two rules, both surfaced here:
 *   1. only a token AGENT may mint (the deployer/operator in this reference deployment), and
 *   2. the recipient must be KYC-verified, or the mint reverts.
 */
export function IssuerMint() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== hubTestnet.id;

  const agent = useReadContract({
    address: contracts.token,
    abi: tokenAdminAbi,
    functionName: "isAgent",
    args: address ? [address] : undefined,
    chainId: hubTestnet.id,
    query: { enabled: !!address },
  });

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const validTo = isAddress(to);

  const recipientVerified = useReadContract({
    address: contracts.identityRegistry,
    abi: identityRegistryAbi,
    functionName: "isVerified",
    args: validTo ? [to as `0x${string}`] : undefined,
    chainId: hubTestnet.id,
    query: { enabled: validTo },
  });

  const { writeContract, isPending, data: hash, error } = useWriteContract();

  function mint() {
    if (!validTo || !amount) return;
    writeContract({
      chainId: hubTestnet.id,
      address: contracts.token,
      abi: tokenAdminAbi,
      functionName: "mint",
      args: [to as `0x${string}`, parseUnits(amount, 18)],
    });
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-edge bg-ink/60 px-3 py-2 font-mono text-sm outline-none focus:border-accent2";

  return (
    <Card title="Issue (mint) the bond" subtitle="primary issuance — restricted to a token agent">
      {!isConnected ? (
        <p className="text-sm text-muted">Connect a wallet to issue tokens.</p>
      ) : wrongChain ? (
        <Button onClick={() => switchChain({ chainId: hubTestnet.id })}>Switch to Polkadot Hub first</Button>
      ) : agent.data === false ? (
        <p className="text-sm leading-relaxed text-muted">
          This wallet is <Badge kind="bad">not a token agent</Badge>. In ERC-3643, minting is restricted to the
          issuer/operator — the deployer in this reference deployment. Ask to be granted the agent role to issue here.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted">Recipient (must be KYC-verified)</label>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" className={inputClass} />
            {validTo && recipientVerified.data === false && (
              <p className="mt-1 text-xs text-rose-600">This address is not KYC-verified — the mint would revert.</p>
            )}
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted">Amount (cBOND)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              inputMode="decimal"
              className={inputClass}
            />
          </div>
          <Button
            onClick={mint}
            disabled={isPending || !validTo || !amount || recipientVerified.data === false}
          >
            {isPending ? "Issuing…" : "Mint bond"}
          </Button>
          {hash && <p className="break-all text-xs text-emerald-600">Submitted: {hash}</p>}
          {error && <p className="text-xs text-rose-600">{(error as Error).message.split("\n")[0]}</p>}
        </div>
      )}
    </Card>
  );
}
