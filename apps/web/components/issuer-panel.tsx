"use client";

import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { ATTESTER_PUBKEY, bridgeAbi, claimTopicsAbi, contracts, erc20Abi } from "@/lib/contracts";
import { AddressLink, Badge, Card, Stat } from "./ui";
import { IssuerMint } from "./issuer-mint";

export function IssuerPanel() {
  const name = useReadContract({ address: contracts.token, abi: erc20Abi, functionName: "name" });
  const symbol = useReadContract({ address: contracts.token, abi: erc20Abi, functionName: "symbol" });
  const decimals = useReadContract({ address: contracts.token, abi: erc20Abi, functionName: "decimals" });
  const supply = useReadContract({ address: contracts.token, abi: erc20Abi, functionName: "totalSupply" });
  const topics = useReadContract({ address: contracts.claimTopicsRegistry, abi: claimTopicsAbi, functionName: "getClaimTopics" });
  const attesterTrusted = useReadContract({
    address: contracts.kiltIdentityBridge,
    abi: bridgeAbi,
    functionName: "trustedAttesterKeys",
    args: [ATTESTER_PUBKEY],
  });

  const dec = decimals.data != null ? Number(decimals.data) : 18;
  const supplyFmt = supply.data != null ? formatUnits(supply.data as bigint, dec) : "…";

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
      <Card title="Security Token" subtitle="ERC-3643 (Tokeny T-REX), vendored unmodified">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Name" value={(name.data as string) ?? "…"} />
          <Stat label="Symbol" value={(symbol.data as string) ?? "…"} />
          <Stat label="Decimals" value={String(dec)} />
          <Stat label="Total Supply" value={supplyFmt} />
        </div>
        <div className="mt-4 text-sm">
          <span className="text-muted">Token contract: </span>
          <AddressLink address={contracts.token} />
        </div>
      </Card>

      <Card title="Compliance & Identity" subtitle="who is allowed to hold this token">
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-muted">Required KYC claim topic</span>
            <span className="font-mono">{topics.data ? (topics.data as bigint[]).map(String).join(", ") : "…"}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted">KILT attester trusted on-chain</span>
            {attesterTrusted.data === true ? <Badge kind="ok">Yes</Badge> : <Badge kind="neutral">…</Badge>}
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted">KILT Identity Bridge</span>
            <AddressLink address={contracts.kiltIdentityBridge} />
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted">Identity Registry</span>
            <AddressLink address={contracts.identityRegistry} />
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted">Trusted Issuers Registry</span>
            <AddressLink address={contracts.trustedIssuersRegistry} />
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted">Modular Compliance</span>
            <AddressLink address={contracts.modularCompliance} />
          </li>
        </ul>
      </Card>
      </div>
      <IssuerMint />
    </div>
  );
}
