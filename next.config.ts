import type { NextConfig } from "next";

function parseSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

const supabaseUrl = parseSupabaseUrl();
const imageSources = ["'self'", "data:", "blob:", "https://images.unsplash.com"];
const connectSources = ["'self'"];

if (supabaseUrl) {
  imageSources.push(
    `${supabaseUrl.origin}/storage/v1/object/public/profile-avatars/`
  );
  connectSources.push(supabaseUrl.origin, `wss://${supabaseUrl.host}`);
}

if (process.env.NODE_ENV === "development") {
  connectSources.push("ws:", "wss:");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src ${connectSources.join(" ")}`,
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  `img-src ${imageSources.join(" ")}`,
  "manifest-src 'self'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      ...(supabaseUrl
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseUrl.hostname,
              port: supabaseUrl.port,
              pathname: "/storage/v1/object/public/profile-avatars/**",
            },
          ]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
