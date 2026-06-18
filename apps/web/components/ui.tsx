import type { ReactNode } from "react";
import { explorer } from "@/lib/contracts";

export function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-edge bg-panel/70 p-5 shadow-lg shadow-black/20 backdrop-blur">
      {title && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Badge({ kind = "neutral", children }: { kind?: "ok" | "bad" | "warn" | "neutral"; children: ReactNode }) {
  const styles: Record<string, string> = {
    ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    bad: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    neutral: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[kind]}`}>
      {children}
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[13px]">{children}</span>;
}

export function short(addr?: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function AddressLink({ address, kind = "address" }: { address: string; kind?: "address" | "tx" }) {
  return (
    <a
      href={`${explorer}/${kind}/${address}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[13px] text-accent2 hover:underline"
    >
      {short(address)}
    </a>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "solid",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "solid" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "solid"
      ? "bg-accent text-white hover:bg-accent/90"
      : "border border-edge bg-transparent text-slate-200 hover:bg-white/5";
  return (
    <button className={`${base} ${styles}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
