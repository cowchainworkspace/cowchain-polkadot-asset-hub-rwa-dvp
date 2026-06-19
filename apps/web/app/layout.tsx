import "./globals.css";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Providers } from "./providers";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Cowchain RWA — Compliant Atomic DvP on Polkadot Hub",
  description:
    "Reference implementation: ERC-3643 security token with on-chain KILT identity and atomic delivery-versus-payment settlement on Polkadot Hub.",
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="font-manrope">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
