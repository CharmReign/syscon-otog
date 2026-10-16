const nextConfig = {
  // Standalone output is for self-hosting (node server.js); Vercel builds its own functions.
  output: process.env.VERCEL ? undefined : 'standalone',
  devIndicators: false,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', pathname: '/**' },
    ],
  },
  // Parsed at runtime with Node APIs, so don't bundle them.
  serverExternalPackages: ['mongodb', 'mammoth'],
  webpack(config, { dev }) {
    if (dev) {
      // Reduce CPU/memory from file watching
      config.watchOptions = {
        poll: 2000, // check every 2 seconds
        aggregateTimeout: 300, // wait before rebuilding
        ignored: ['**/node_modules'],
      };
    }
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  // The API is cookie-authenticated, so cross-origin access is opt-in: set CORS_ORIGINS
  // to a specific origin only if another site must call it.
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    ];
    const cors = process.env.CORS_ORIGINS
      ? [
          { key: 'Access-Control-Allow-Origin', value: process.env.CORS_ORIGINS },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ]
      : [];
    return [{ source: '/(.*)', headers: [...security, ...cors] }];
  },
};

module.exports = nextConfig;
