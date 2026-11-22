import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
// Next only auto-loads apps/web/.env*; load the monorepo root env as well so
// NEXT_PUBLIC_API_URL / NEXT_PUBLIC_RESTAURANT_ID have a single source of truth.
loadEnv({ path: resolve(here, '../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@shift-happens/shared'],
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    NEXT_PUBLIC_RESTAURANT_ID:
      process.env.NEXT_PUBLIC_RESTAURANT_ID ||
      '11111111-1111-4111-8111-111111111111',
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'placehold.co' },
    ],
  },
};

export default nextConfig;
