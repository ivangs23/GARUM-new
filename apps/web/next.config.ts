import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@garum/shared"],
  productionBrowserSourceMaps: false,
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
  // Stripe hosts the Apple Pay domain-association file. Redirecting our
  // .well-known path to Stripe is the documented way to register the domain
  // without committing the file to the repo.
  // https://docs.stripe.com/payments/payment-methods/pmd-registration
  async redirects() {
    return [
      {
        source: "/.well-known/apple-developer-merchantid-domain-association",
        destination:
          "https://stripe.com/.well-known/apple-developer-merchantid-domain-association",
        permanent: false,
      },
    ];
  },
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
