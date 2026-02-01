/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Em dev usa dist/ em vez de .next/ para reduzir errno -4094 no Windows
  distDir: process.env.NODE_ENV === 'development' ? 'dist' : '.next',
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
