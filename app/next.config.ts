import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // A self-contained server bundle for hosting elsewhere (e.g. the public demo machine).
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
};
export default config;
