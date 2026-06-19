import type { ReactNode } from "react";
import { explorer } from "@/lib/contracts";

export function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-5 shadow-card">
      {title && (
        <div className="mb-4 border-b border-edge pb-3">
          <h3 className="text-lg font-semibold lowercase text-strong">{title}</h3>
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
      <div className="text-[11px] lowercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-strong">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Badge({ kind = "neutral", children }: { kind?: "ok" | "bad" | "warn" | "neutral"; children: ReactNode }) {
  const styles: Record<string, string> = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bad: "bg-rose-50 text-rose-700 border-rose-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    neutral: "bg-neutral-100 text-neutral-600 border-neutral-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[kind]}`}>
      {children}
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[13px] text-body">{children}</span>;
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
      className="font-mono text-[13px] font-medium text-accent hover:underline"
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
}): React.ReactElement {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "solid"
      ? "bg-accent text-white shadow-sm hover:brightness-110"
      : "border border-neutral-300 bg-white text-body hover:border-accent hover:text-accent";
  return (
    <button className={`${base} ${styles}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
