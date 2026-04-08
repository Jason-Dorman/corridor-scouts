/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting runs as a separate CI step (npm run lint) — don't block production builds on it.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
