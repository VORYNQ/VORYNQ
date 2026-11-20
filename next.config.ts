import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Old link to the Finance Agents page.
    return [{ source: "/finance-agents", destination: "/agents/finance", permanent: true }];
  },
};

export default nextConfig;
