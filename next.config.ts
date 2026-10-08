import type { NextConfig } from "next";

const config: NextConfig = {
  // Separate loopback origins let owner/partner browser sessions be verified
  // against the development database without sharing browser storage.
  allowedDevOrigins: ["127.0.0.1"],
};

export default config;
