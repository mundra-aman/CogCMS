import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTrustedOrigins } from './lib/env';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const trustedOrigins = parseTrustedOrigins(process.env.CMS_TRUSTED_ORIGINS);
const remotePatterns: NonNullable<NextConfig['images']>['remotePatterns'] = [
  // Add any external image hosts used by your content explicitly.
];

if (process.env.S3_PUBLIC_URL) {
  try {
    const publicUrl = new URL(process.env.S3_PUBLIC_URL);
    remotePatterns.push({
      protocol: publicUrl.protocol.replace(':', '') as 'http' | 'https',
      hostname: publicUrl.hostname,
      port: publicUrl.port,
      pathname: '/**',
    });
  } catch {
    // Ignore an invalid S3_PUBLIC_URL so local development still boots.
  }
}

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  images: { remotePatterns },
  turbopack: { root: projectRoot },
  experimental: {
    serverActions: { allowedOrigins: trustedOrigins },
  },
};

export default nextConfig;
