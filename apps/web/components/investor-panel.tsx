"use client";

import { useAccount, useBalance, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { formatUnits } from "viem";
import { contracts, erc20Abi, hubTestnet, identityRegistryAbi, stablecoinAbi } from "@/lib/contracts";
import { Badge, Button, Card, Stat } from "./ui";

export function InvestorPanel() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== hubTestnet.id;
  // Pin all reads to Hub so balances/KYC are correct even if the wallet is on another network.
  const onHub = { chainId: hubTestnet.id, query: { enabled: !!address } } as const;

  const verified = useReadContract({
    address: contracts.identityRegistry,
    abi: identityRegistryAbi,
    functionName: "isVerified",
    args: address ? [address] : undefined,
    ...onHub,
  });
  const bond = useReadContract({
    address: contracts.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    ...onHub,
  });
  const cash = useReadContract({
    address: contracts.mockStablecoin,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    ...onHub,
  });
  const pas = useBalance({ address, chainId: hubTestnet.id, query: { enabled: !!address } });
  const { writeContract, isPending } = useWriteContract();

  if (!isConnected) {
    return (
      <Card title="Investor">
        <p className="text-sm text-muted">Connect a wallet to view your KYC status and holdings.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card title="Your Identity" subtitle="ERC-3643 holder eligibility">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">KYC verified via KILT</span>
          {verified.data === true ? (
            <Badge kind="ok">Verified</Badge>
          ) : verified.data === false ? (
            <Badge kind="bad">Not verified</Badge>
          ) : (
            <Badge kind="neutral">…</Badge>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Verification is proven by an on-chain KILT <span className="text-strong">sr25519</span> signature, checked
          natively by the System precompile (<span className="font-mono">0x900</span>). Without a valid KYC claim this
          security token cannot be received — transfers revert.
        </p>
      </Card>

      <Card title="Your Holdings">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="cBOND" value={bond.data != null ? formatUnits(bond.data as bigint, 18) : "…"} />
          <Stat label="mUSD" value={cash.data != null ? formatUnits(cash.data as bigint, 6) : "…"} />
          <Stat label="PAS" value={pas.data ? Number(pas.data.formatted).toFixed(2) : "…"} />
        </div>
        <div className="mt-4">
          {wrongChain ? (
            <Button onClick={() => switchChain({ chainId: hubTestnet.id })}>Switch to Polkadot Hub first</Button>
          ) : (
            <Button
              disabled={isPending}
              onClick={() =>
                writeContract({
                  chainId: hubTestnet.id,
                  address: contracts.mockStablecoin,
                  abi: stablecoinAbi,
                  functionName: "drip",
                })
              }
            >
              {isPending ? "Requesting…" : "Get test mUSD (faucet)"}
            </Button>
          )}
          <p className="mt-2 text-xs text-muted">
            Transactions need a little <span className="text-strong">PAS</span> for gas — get test PAS from the{" "}
            <a
              href="https://faucet.polkadot.io/"
              target="_blank"
              rel="noreferrer"
              className="text-accent2 hover:underline"
            >
              Polkadot faucet
            </a>{" "}
            (select &ldquo;Polkadot Hub TestNet&rdquo;).
          </p>
        </div>
      </Card>
    </div>
  );
}
