import type { NextConfig } from "next";

/**
 * Security headers applied to every response. The Content-Security-Policy is
 * intentionally permissive for images so catalogue photography can be served
 * from local storage or Supabase Storage/CDN hosts, while script sources stay
 * self-hosted.
 */
const scriptSrc = process.env.NODE_ENV === "production" ? "'self'" : "'self' 'unsafe-eval'";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc} 'unsafe-inline' https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://res.cloudinary.com https://api.razorpay.com https://lumberjack.razorpay.com",
  "frame-src 'self' https://www.google.com https://maps.google.com https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Kept off so data fetching follows the standard App Router model
  // (explicit `revalidate`/dynamic rendering) rather than the Cache
  // Components model. See docs/architecture.md for the rationale.
  cacheComponents: false,
  poweredByHeader: false,
  reactStrictMode: true,
  // Product image uploads are handled by the admin Server Action. Keep this
  // just above the form's 5 MB file limit to include multipart overhead.
  experimental: {
    // Remind future `next dev`/`next build` runs when a security advisory
    // affects the installed stable version (the default policy).
    agentUpgrade: "security",
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Vercel's built-in optimizer returns 402 when the project's image
    // optimisation allowance is exhausted. Use Supabase Storage's resize
    // endpoint for remote photos and serve local assets directly instead.
    loader: "custom",
    loaderFile: "./src/lib/images/loader.js",
    // Next.js 16 requires explicit remote patterns instead of `domains`.
    // Kept for documentation/any future non-custom loader and to make the
    // accepted Supabase hosts explicit.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/render/image/public/**",
      },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
    formats: ["image/avif", "image/webp"],
    qualities: [60, 75, 85],
    minimumCacheTTL: 3600,
    dangerouslyAllowLocalIP: true,
  },
  async redirects() {
    return [
      {
        // The original multi-colour product was split into one product per
        // colour. Send old links to the collection rather than a dead product.
        source: "/products/raindrop-glass-bangles",
        destination: "/collections/glass-bangles",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Never cache authenticated admin surfaces or API mutations.
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
