"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { contracts, dvpAbi, erc20Abi, TRADE_STATUS } from "@/lib/contracts";
import { AddressLink, Badge, Card, Stat } from "./ui";

// The `trades(uint256)` mapping getter returns the struct's fields flattened, so viem decodes it as a
// positional tuple (NOT an object): [seller, buyer, securityToken, securityAmount, paymentToken,
// paymentAmount, expiry, status].
type TradeTuple = readonly [
  `0x${string}`, // seller
  `0x${string}`, // buyer
  `0x${string}`, // securityToken
  bigint, // securityAmount
  `0x${string}`, // paymentToken
  bigint, // paymentAmount
  bigint, // expiry
  number, // status
];

function statusBadge(status: number) {
  if (status === 2) return <Badge kind="ok">Settled</Badge>;
  if (status === 1) return <Badge kind="warn">Pending</Badge>;
  if (status === 3) return <Badge kind="neutral">Cancelled</Badge>;
  return <Badge kind="neutral">{TRADE_STATUS[status] ?? "?"}</Badge>;
}

export function ReportingPanel() {
  const count = useReadContract({ address: contracts.dvpSettlement, abi: dvpAbi, functionName: "tradeCount" });
  const supply = useReadContract({ address: contracts.token, abi: erc20Abi, functionName: "totalSupply" });
  const n = count.data != null ? Number(count.data as bigint) : 0;

  const trades = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: contracts.dvpSettlement,
      abi: dvpAbi,
      functionName: "trades" as const,
      args: [BigInt(i + 1)],
    })),
    query: { enabled: n > 0 },
  });

  const settled = (trades.data ?? []).filter((t) => (t.result as TradeTuple | undefined)?.[7] === 2).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <Card>
          <Stat label="Total bond supply" value={supply.data != null ? formatUnits(supply.data as bigint, 18) : "…"} hint="cBOND" />
        </Card>
        <Card>
          <Stat label="DvP trades" value={String(n)} />
        </Card>
        <Card>
          <Stat label="Settled" value={String(settled)} hint="atomic, on-chain" />
        </Card>
      </div>

      <Card title="Settlement Ledger" subtitle="every delivery-versus-payment trade on this token">
        {n === 0 ? (
          <p className="text-sm text-muted">No trades yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr className="border-b border-edge">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Seller</th>
                  <th className="py-2 pr-4">Buyer</th>
                  <th className="py-2 pr-4">Bond</th>
                  <th className="py-2 pr-4">Cash</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(trades.data ?? []).map((t, i) => {
                  const trade = t.result as TradeTuple | undefined;
                  if (!trade) return null;
                  const [seller, buyer, , securityAmount, , paymentAmount, , status] = trade;
                  return (
                    <tr key={i} className="border-b border-edge/50">
                      <td className="py-2.5 pr-4 font-mono text-muted">{i + 1}</td>
                      <td className="py-2.5 pr-4">
                        <AddressLink address={seller} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <AddressLink address={buyer} />
                      </td>
                      <td className="py-2.5 pr-4 font-mono">{formatUnits(securityAmount, 18)}</td>
                      <td className="py-2.5 pr-4 font-mono">{formatUnits(paymentAmount, 6)}</td>
                      <td className="py-2.5">{statusBadge(status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
