/**
 * Rate Limiter simples (em memória)
 * 
 * Para produção, considere usar Redis ou um serviço dedicado.
 * Este é um rate limiter básico para desenvolvimento/pequena escala.
 */

type RateLimitStore = Map<string, { count: number; resetAt: number }>

// Store em memória (limpa a cada reset)
const store: RateLimitStore = new Map()

// Limpar entradas expiradas periodicamente
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of store.entries()) {
    if (value.resetAt < now) {
      store.delete(key)
    }
  }
}, 60000) // Limpar a cada minuto

/**
 * Verifica se um IP excedeu o limite de tentativas
 * 
 * @param ip - IP do cliente
 * @param maxAttempts - Número máximo de tentativas
 * @param windowMs - Janela de tempo em milissegundos
 * @returns true se excedeu o limite, false caso contrário
 */
export function checkRateLimit(
  ip: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutos
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(ip)

  // Se não existe entrada ou expirou, criar nova
  if (!entry || entry.resetAt < now) {
    const resetAt = now + windowMs
    store.set(ip, { count: 1, resetAt })
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetAt,
    }
  }

  // Se ainda está dentro da janela
  if (entry.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    }
  }

  // Incrementar contador
  entry.count++
  store.set(ip, entry)

  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Obtém o IP do cliente da requisição Next.js
 */
export function getClientIP(request: Request): string {
  // Tentar pegar de headers comuns de proxy/load balancer
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfConnectingIP = request.headers.get('cf-connecting-ip') // Cloudflare

  if (forwarded) {
    // x-forwarded-for pode ter múltiplos IPs, pegar o primeiro
    return forwarded.split(',')[0].trim()
  }

  if (realIP) {
    return realIP.trim()
  }

  if (cfConnectingIP) {
    return cfConnectingIP.trim()
  }

  // Fallback: usar um IP genérico se não conseguir identificar
  // Em produção, considere registrar um aviso
  return 'unknown'
}
