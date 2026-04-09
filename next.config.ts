import type {NextConfig} from 'next';

const basePathEnv = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
const isProduction = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Server Actions configuration for larger file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // Increased from default 1mb to 50mb
    },
  },
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.atlassian.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.atlassian.net',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'trello-avatars.s3.amazonaws.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'trello-backgrounds.s3.amazonaws.com',
        port: '',
        pathname: '/**',
      },
    ],
    dangerouslyAllowSVG: true,
    // Production image optimizations
    ...(isProduction && {
      formats: ['image/avif', 'image/webp'],
      minimumCacheTTL: 60,
    }),
  },
  // Production optimizations
  ...(isProduction && {
    // Note: swcMinify is deprecated in Next.js 15+ (SWC is default)
    // Compress output
    compress: true,
    // Production build optimizations
    productionBrowserSourceMaps: false, // Disable source maps in production for security
    poweredByHeader: false, // Remove X-Powered-By header
    // Optimize output
    output: 'standalone', // Create standalone build for Docker
    // Enable React strict mode in production
    reactStrictMode: true,
  }),
  basePath: basePathEnv,
  async rewrites() {
    if (!basePathEnv) return [];
    return [
      // Only rewrite API requests to handle both basePath and root paths
      { source: `${basePathEnv}/api/:path*`, destination: `/api/:path*` },
      { source: `/api/:path*`, destination: `${basePathEnv}/api/:path*` },
      // Rewrite shared project routes without basePath to include basePath
      // This allows /shared/project/[shareId] to work and redirect to /gmail/shared/project/[shareId]
      { source: `/shared/project/:shareId*`, destination: `${basePathEnv}/shared/project/:shareId*` },
    ];
  },
  webpack: (config, { isServer }) => {
    // Fix for OpenTelemetry/Jaeger - ignore missing optional dependencies
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@opentelemetry/exporter-jaeger': false,
      '@opentelemetry/exporter-otlp-http': false,
      '@opentelemetry/exporter-otlp-grpc': false,
    };

    // Fix for Handlebars require.extensions - ignore handlebars in client bundle
    // Also prevent client bundling of server-only modules (Genkit, test-case-generator, pdfjs-dist)
    if (!isServer) {
      // Use aliases to prevent client bundling
      const existingAlias = config.resolve.alias || {};
      config.resolve.alias = {
        ...existingAlias,
        'handlebars': false,
        'dotprompt': false,
        'pdf-parse': false,
        'unpdf': false, // Prevent client bundling of unpdf (server-only)
        'genkit': false,
        '@genkit-ai/core': false,
        '@genkit-ai/googleai': false,
      };
    }

    // Ignore handlebars require.extensions warning and Genkit-related warnings
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /handlebars/,
        message: /require\.extensions/,
      },
      {
        module: /@opentelemetry/,
        message: /Can't resolve/,
      },
      {
        module: /@genkit-ai/,
        message: /Can't resolve/,
      },
      {
        module: /genkit/,
        message: /Can't resolve/,
      },
    ];

    return config;
  },
};

export default nextConfig;
