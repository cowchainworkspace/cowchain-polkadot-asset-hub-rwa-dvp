/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Silence optional-dependency warnings pulled in transitively by wagmi connectors
  // (WalletConnect's pino logger, MetaMask SDK's React-Native storage) — unused on web.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
