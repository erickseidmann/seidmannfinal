/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config, { dev }) {
    if (dev) {
      // Desabilita cache em disco do webpack no ambiente de desenvolvimento
      config.cache = false
    }
    return config
  },
}

module.exports = nextConfig
