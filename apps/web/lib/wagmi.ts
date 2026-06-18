import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { hubTestnet } from "./contracts";

export const config = createConfig({
  chains: [hubTestnet],
  connectors: [injected()],
  transports: {
    [hubTestnet.id]: http("https://eth-rpc-testnet.polkadot.io/"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
