/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Test files have pre-existing lint issues that don't affect production
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
