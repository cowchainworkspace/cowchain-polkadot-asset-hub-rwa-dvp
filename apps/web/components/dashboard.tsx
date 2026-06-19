"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hubTestnet } from "@/lib/contracts";
import { short } from "./ui";
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

function WalletConnect(): React.ReactElement {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [menuOpen, setMenuOpen] = useState(false);
  const injected = connectors[0];
  const wrongChain = isConnected && chainId !== hubTestnet.id;

  const solid =
    "inline-flex items-center justify-center whitespace-nowrap rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-accent shadow-sm transition hover:bg-white/90 disabled:opacity-50";
  const ghost =
    "inline-flex items-center justify-center whitespace-nowrap rounded-md border border-white/50 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10";

  if (!isConnected) {
    return (
      <button className={solid} onClick={() => injected && connect({ connector: injected })} disabled={isPending || !injected}>
        {isPending ? "Connecting…" : injected ? "Connect Wallet" : "No wallet found"}
      </button>
    );
  }
  return (
    <>
      {/* Desktop: actions inline */}
      <div className="hidden items-center gap-2 sm:flex">
        {wrongChain ? (
          <button className={solid} onClick={() => switchChain({ chainId: hubTestnet.id })} disabled={switching}>
            {switching ? "Switching…" : "Switch to Polkadot Hub"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
            {short(address)}
          </span>
        )}
        <button className={ghost} onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>

      {/* Mobile: compact dropdown so the brand name stays visible */}
      <div className="relative sm:hidden">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-white/15 px-2.5 py-1.5 text-sm font-medium text-white"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${wrongChain ? "bg-amber-300" : "bg-emerald-300"}`} />
          {short(address)}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className={menuOpen ? "rotate-180" : ""}>
            <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {menuOpen && (
          <>
            <button className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-edge bg-panel py-1 text-body shadow-lg">
              <div className="px-3 py-2 text-xs text-muted">
                <div className="font-mono text-body">{short(address)}</div>
                <div className={wrongChain ? "text-amber-600" : "text-emerald-600"}>
                  {wrongChain ? "Wrong network" : "Polkadot Hub TestNet"}
                </div>
              </div>
              {wrongChain && (
                <button
                  className="block w-full px-3 py-2 text-left text-sm font-medium text-accent hover:bg-ink disabled:opacity-50"
                  onClick={() => switchChain({ chainId: hubTestnet.id })}
                  disabled={switching}
                >
                  {switching ? "Switching…" : "Switch to Polkadot Hub"}
                </button>
              )}
              <button
                className="block w-full px-3 py-2 text-left text-sm text-body hover:bg-ink"
                onClick={() => {
                  setMenuOpen(false);
                  disconnect();
                }}
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function TopBar(): React.ReactElement {
  return (
    <header className="bg-accent text-white">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cowchain-mark.svg" alt="Cowchain" className="h-5 w-5" />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold tracking-wide">COWCHAIN RWA</div>
            <div className="hidden truncate text-[11px] text-white/70 sm:block">
              Polkadot Hub TestNet · ERC-3643
            </div>
          </div>
        </div>
        <nav className="ml-6 hidden items-center gap-5 text-sm font-medium text-white/85 md:flex">
          <a className="rounded-md bg-white/15 px-3 py-1 text-white" href="#">
            RWA Portal
          </a>
          <a
            className="hover:text-white"
            href="https://github.com/cowchainworkspace/cowchain-polkadot-asset-hub-rwa-dvp"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
        <div className="ml-auto">
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}

function SubNav({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }): React.ReactElement {
  return (
    <nav className="border-b border-edge bg-panel">
      <div className="mx-auto flex h-12 max-w-[1180px] items-center gap-8 px-4">
        <div className="flex h-full items-center gap-6">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex h-full items-center text-sm transition ${
                  active ? "font-semibold text-strong" : "text-muted hover:text-body"
                }`}
              >
                {t.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function NetworkBanner(): React.ReactElement | null {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || chainId === hubTestnet.id) return null;
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-lg border border-warning/60 bg-warning/10 px-4 py-3 text-sm text-warning-foreground sm:flex-row sm:items-center">
      <span>
        Your wallet is on the wrong network. Switch to <b>Polkadot Hub TestNet</b> to transact. (On-chain data
        below still reads correctly from Hub.)
      </span>
      <button
        className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        onClick={() => switchChain({ chainId: hubTestnet.id })}
        disabled={isPending}
      >
        {isPending ? "Switching…" : "Switch network"}
      </button>
    </div>
  );
}

export function Dashboard(): React.ReactElement {
  const [tab, setTab] = useState<TabId>("issuer");

  return (
    <div className="min-h-screen bg-ink">
      <TopBar />
      <SubNav tab={tab} setTab={setTab} />

      <main className="mx-auto max-w-[1180px] px-4 py-6">
        <p className="mb-6 max-w-3xl text-sm text-muted">
          Compliant security-token issuance with on-chain KILT identity and{" "}
          <span className="font-medium text-body">atomic delivery-versus-payment</span> settlement. A reference
          implementation by Cowchain — live on Polkadot Hub.
        </p>

        <NetworkBanner />

        {tab === "issuer" && <IssuerPanel />}
        {tab === "investor" && <InvestorPanel />}
        {tab === "dvp" && <DvpPanel />}
        {tab === "reporting" && <ReportingPanel />}

        <footer className="mt-10 border-t border-edge pt-5 text-xs text-muted">
          The ERC-3643 token reverts transfers to non-verified holders; because DvP settles both legs in one
          transaction, a non-compliant buyer reverts the payment too. Compliance and settlement compose automatically.
        </footer>
      </main>
    </div>
  );
}
