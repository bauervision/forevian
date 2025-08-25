/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // ✅ replaces next export
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, // optional, if you need to bypass TS build blocks
  },
};

module.exports = nextConfig;
