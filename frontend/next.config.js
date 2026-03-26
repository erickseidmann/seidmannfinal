/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: '/admin/kanban', destination: '/admin/todos', permanent: true }]
  },
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
      // Windows: polling reduz corridas entre watcher e leitura de chunks (errno -4094 em layout.js)
      if (process.platform === 'win32') {
        config.watchOptions = {
          ...(config.watchOptions || {}),
          poll: 2000,
          aggregateTimeout: 600,
        }
      }
    }
    return config
  },
}

module.exports = nextConfig
