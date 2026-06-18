"use client";

import { useState } from "react";
import { useAccount, useReadContract, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { formatUnits, isAddress, parseUnits } from "viem";
import { contracts, dvpAbi, erc20Abi, hubTestnet } from "@/lib/contracts";
import { AddressLink, Badge, Button, Card } from "./ui";

const BOND_DECIMALS = 18;
const CASH_DECIMALS = 6;

type Trade = readonly [`0x${string}`, `0x${string}`, `0x${string}`, bigint, `0x${string}`, bigint, bigint, number];

export function DvpPanel() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== hubTestnet.id;
  const me = address?.toLowerCase();
  const { writeContract, isPending } = useWriteContract();

  const [buyer, setBuyer] = useState("");
  const [bond, setBond] = useState("");
  const [cash, setCash] = useState("");
  const validBuyer = isAddress(buyer);

  const count = useReadContract({
    address: contracts.dvpSettlement,
    abi: dvpAbi,
    functionName: "tradeCount",
    chainId: hubTestnet.id,
  });
  const n = count.data ? Number(count.data as bigint) : 0;

  const tradesRead = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: contracts.dvpSettlement,
      abi: dvpAbi,
      functionName: "trades" as const,
      args: [BigInt(i + 1)],
      chainId: hubTestnet.id,
    })),
    query: { enabled: n > 0 },
  });

  const bondAllow = useReadContract({
    address: contracts.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, contracts.dvpSettlement] : undefined,
    chainId: hubTestnet.id,
    query: { enabled: !!address },
  });
  const cashAllow = useReadContract({
    address: contracts.mockStablecoin,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, contracts.dvpSettlement] : undefined,
    chainId: hubTestnet.id,
    query: { enabled: !!address },
  });

  const bondAllowance = (bondAllow.data as bigint | undefined) ?? 0n;
  const cashAllowance = (cashAllow.data as bigint | undefined) ?? 0n;

  const myTrades = (tradesRead.data ?? [])
    .map((r, i) => ({ id: i + 1, t: r.result as Trade | undefined }))
    .filter((x): x is { id: number; t: Trade } => !!x.t && x.t[7] === 1 && (x.t[0].toLowerCase() === me || x.t[1].toLowerCase() === me));

  function createTrade() {
    if (!validBuyer || !bond || !cash) return;
    writeContract({
      chainId: hubTestnet.id,
      address: contracts.dvpSettlement,
      abi: dvpAbi,
      functionName: "createTrade",
      args: [
        buyer as `0x${string}`,
        contracts.token,
        parseUnits(bond, BOND_DECIMALS),
        contracts.mockStablecoin,
        parseUnits(cash, CASH_DECIMALS),
        0n,
      ],
    });
  }

  function approve(token: `0x${string}`, amount: bigint) {
    writeContract({
      chainId: hubTestnet.id,
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [contracts.dvpSettlement, amount],
    });
  }
  function act(fn: "settle" | "cancelTrade", id: number) {
    writeContract({ chainId: hubTestnet.id, address: contracts.dvpSettlement, abi: dvpAbi, functionName: fn, args: [BigInt(id)] });
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-edge bg-ink/60 px-3 py-2 font-mono text-sm outline-none focus:border-accent2";

  if (!isConnected) {
    return (
      <Card title="Trade (DvP)">
        <p className="text-sm text-muted">Connect a wallet to create and settle trades.</p>
      </Card>
    );
  }
  if (wrongChain) {
    return (
      <Card title="Trade (DvP)">
        <Button onClick={() => switchChain({ chainId: hubTestnet.id })}>Switch to Polkadot Hub first</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card title="Create a trade" subtitle="you are the seller — deliver cBOND, receive mUSD">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <label className="text-xs uppercase tracking-wider text-muted">Buyer address (must be KYC-verified)</label>
            <input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="0x…" className={inputClass} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted">cBOND to sell</label>
            <input value={bond} onChange={(e) => setBond(e.target.value)} placeholder="100" inputMode="decimal" className={inputClass} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted">mUSD price</label>
            <input value={cash} onChange={(e) => setCash(e.target.value)} placeholder="1000" inputMode="decimal" className={inputClass} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button onClick={createTrade} disabled={isPending || !validBuyer || !bond || !cash}>
              {isPending ? "…" : "Create trade"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          After creating, approve cBOND in your open trades below. The buyer approves mUSD and either party hits
          Settle — both legs move atomically in one transaction (or neither does).
        </p>
      </Card>

      <Card title="Your open trades" subtitle="pending trades where you are a party">
        {myTrades.length === 0 ? (
          <p className="text-sm text-muted">No pending trades involving your wallet.</p>
        ) : (
          <div className="space-y-3">
            {myTrades.map(({ id, t }) => {
              const iAmSeller = t[0].toLowerCase() === me;
              const bondAmt = t[3];
              const cashAmt = t[5];
              const needBondApproval = iAmSeller && bondAllowance < bondAmt;
              const needCashApproval = !iAmSeller && cashAllowance < cashAmt;
              return (
                <div key={id} className="rounded-lg border border-edge bg-ink/40 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted">#{id}</span>
                      <Badge kind="neutral">{iAmSeller ? "You sell" : "You buy"}</Badge>
                      <span className="font-mono">
                        {formatUnits(bondAmt, BOND_DECIMALS)} cBOND ⇄ {formatUnits(cashAmt, CASH_DECIMALS)} mUSD
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {iAmSeller ? "buyer " : "seller "}
                      <AddressLink address={iAmSeller ? t[1] : t[0]} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {needBondApproval && (
                      <Button onClick={() => approve(contracts.token, bondAmt)} disabled={isPending}>
                        Approve cBOND
                      </Button>
                    )}
                    {needCashApproval && (
                      <Button onClick={() => approve(contracts.mockStablecoin, cashAmt)} disabled={isPending}>
                        Approve mUSD
                      </Button>
                    )}
                    <Button onClick={() => act("settle", id)} disabled={isPending}>
                      Settle
                    </Button>
                    <Button variant="ghost" onClick={() => act("cancelTrade", id)} disabled={isPending}>
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
