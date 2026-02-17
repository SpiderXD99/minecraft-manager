/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Abilita standalone output per Docker
  output: 'standalone',
  // Configurazione API per upload di file grandi
  experimental: {
    // Nessun limite di dimensione body
    isrMemoryCacheSize: 0,
  },
  // Configurazione server
  serverRuntimeConfig: {
    // Aumenta il timeout per le API routes
    maxDuration: 300, // 5 minuti
  },
  // Accetta qualsiasi dominio (generico)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
  // Configurazione per WebSocket in produzione
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig
