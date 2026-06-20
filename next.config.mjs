/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Test files have pre-existing lint issues that don't affect production
    ignoreDuringBuilds: true,
  },
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // H8: HSTS — tell browsers to only connect over HTTPS for 1 year
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            key: 'Content-Security-Policy',
            // H9: Remove 'unsafe-eval' from script-src.
            // 'unsafe-inline' is retained for now because Next.js App Router inlines
            // per-page scripts; removing it requires nonce/hash configuration in the
            // Next.js custom Document and is a larger refactor. See:
            // https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
            value: [
              "default-src 'self'",
              `connect-src 'self' ${supabaseUrl} wss://*.supabase.co https://api.anthropic.com`,
              `img-src 'self' data: blob: ${supabaseUrl}`,
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
