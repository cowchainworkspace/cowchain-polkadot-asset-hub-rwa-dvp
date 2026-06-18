"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hubTestnet } from "@/lib/contracts";
import { Badge, Button, short } from "./ui";
import { IssuerPanel } from "./issuer-panel";
import { InvestorPanel } from "./investor-panel";
import { DvpPanel } from "./dvp-panel";
import { ReportingPanel } from "./reporting-panel";

const TABS = [
  { id: "issuer", label: "Issuer" },
  { id: "investor", label: "Investor" },
  { id: "dvp", label: "Trade (DvP)" },
  { id: "reporting", label: "Reporting" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function WalletConnect() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const injected = connectors[0];
  const wrongChain = isConnected && chainId !== hubTestnet.id;

  if (!isConnected) {
    return (
      <Button onClick={() => injected && connect({ connector: injected })} disabled={isPending || !injected}>
        {isPending ? "Connecting…" : injected ? "Connect Wallet" : "No wallet found"}
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {wrongChain ? (
        <Button onClick={() => switchChain({ chainId: hubTestnet.id })} disabled={switching}>
          {switching ? "Switching…" : "Switch to Polkadot Hub"}
        </Button>
      ) : (
        <Badge kind="ok">●&nbsp;{short(address)}</Badge>
      )}
      <Button variant="ghost" onClick={() => disconnect()}>
        Disconnect
      </Button>
    </div>
  );
}

function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || chainId === hubTestnet.id) return null;
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 sm:flex-row sm:items-center">
      <span>
        Your wallet is on the wrong network. Switch to <b>Polkadot Hub TestNet</b> to transact. (On-chain data
        below still reads correctly from Hub.)
      </span>
      <Button onClick={() => switchChain({ chainId: hubTestnet.id })} disabled={isPending}>
        {isPending ? "Switching…" : "Switch network"}
      </Button>
    </div>
  );
}

export function Dashboard() {
  const [tab, setTab] = useState<TabId>("issuer");

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            <h1 className="text-xl font-semibold text-slate-100">Cowchain RWA</h1>
            <Badge kind="neutral">Polkadot Hub TestNet</Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Compliant security-token issuance with on-chain KILT identity and{" "}
            <span className="text-slate-300">atomic delivery-versus-payment</span> settlement. A reference
            implementation by Cowchain — live on Polkadot Hub.
          </p>
        </div>
        <WalletConnect />
      </header>

      <NetworkBanner />

      <nav className="mb-6 flex gap-1 rounded-xl border border-edge bg-panel/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.id ? "bg-accent text-white" : "text-muted hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "issuer" && <IssuerPanel />}
      {tab === "investor" && <InvestorPanel />}
      {tab === "dvp" && <DvpPanel />}
      {tab === "reporting" && <ReportingPanel />}

      <footer className="mt-10 border-t border-edge pt-5 text-xs text-muted">
        The ERC-3643 token reverts transfers to non-verified holders; because DvP settles both legs in one
        transaction, a non-compliant buyer reverts the payment too. Compliance and settlement compose automatically.
      </footer>
    </main>
  );
}
