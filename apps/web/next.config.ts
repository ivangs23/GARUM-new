import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["@garum/shared"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'vjrttuhdrkljcdixartp.supabase.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Security headers. No CSP por ahora: el Payment Element de Stripe carga
  // scripts y iframes desde js.stripe.com/hooks.stripe.com y construir una
  // política que no los rompa requiere pruebas reales con 3D-Secure.
  // Cuando se aborde, ver: https://docs.stripe.com/security/guide#content-security-policy
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
