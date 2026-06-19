import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Polkadot portal (polkadot.js apps) light theme.
        ink: "#f5f5f5", // page background
        panel: "#ffffff", // cards / surfaces
        edge: "#ededed", // hairline borders
        accent: "#e6007a", // Polkadot pink — header, links, primary
        accent2: "#e6007a", // links share the pink
        muted: "#8b8b8b", // secondary / label text
        body: "#4a4a4a", // primary body text
        strong: "#1a1a1a", // headings / emphasis
        // shadcn "warning" intent (oklch 0.828 0.189 84.429 ≈ amber-400)
        warning: "#f5b50a",
        "warning-foreground": "#7a5b00",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        manrope: ["var(--font-manrope)", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03)",
      },
    },
  },
  plugins: [],
} satisfies Config;
