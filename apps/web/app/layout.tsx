import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Cowchain RWA — Compliant Atomic DvP on Polkadot Hub",
  description:
    "Reference implementation: ERC-3643 security token with on-chain KILT identity and atomic delivery-versus-payment settlement on Polkadot Hub.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
