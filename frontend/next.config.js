/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
  },
  // Usar sempre .next (em dev dist/ pode causar errno -4094 ao abrir chunks no Windows)
  // distDir: '.next',
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', pathname: '/**' },
      { protocol: 'https', hostname: 'localhost', pathname: '/**' },
    ],
  },
  // Evita errno -4094 e "incorrect header check" no cache do webpack no Windows
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false
    }
    return config
  },
}

module.exports = nextConfig
