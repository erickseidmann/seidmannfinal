/**
 * Gerenciamento de sessão simples usando cookies httpOnly
 * 
 * Implementação mínima e segura para autenticação no Next.js App Router
 */

import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

// Chave secreta para assinatura do JWT (usar variável de ambiente)
const SECRET_KEY = process.env.SESSION_SECRET || 'change-me-in-production-min-32-chars'
const SESSION_COOKIE = 'session_token'

/**
 * Cria um token JWT com os dados do usuário
 */
async function createSessionToken(payload: { userId: string; email: string; role: string; status: string }): Promise<string> {
  const secret = new TextEncoder().encode(SECRET_KEY)
  
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // Sessão expira em 7 dias
    .sign(secret)

  return token
}

/**
 * Verifica e decodifica o token JWT da sessão
 */
async function verifySessionToken(token: string): Promise<{ userId: string; email: string; role: string; status: string } | null> {
  try {
    const secret = new TextEncoder().encode(SECRET_KEY)
    const { payload } = await jwtVerify(token, secret)
    
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as string,
      status: payload.status as string,
    }
  } catch (error) {
    return null
  }
}

/**
 * Cria uma resposta com cookie de sessão
 */
export async function createSession(
  response: NextResponse,
  payload: { userId: string; email: string; role: string; status: string }
): Promise<NextResponse> {
  const token = await createSessionToken(payload)
  
  // Cookie httpOnly, secure em produção, sameSite para segurança CSRF
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    path: '/',
  })

  return response
}

/**
 * Verifica a sessão atual e retorna os dados do usuário
 */
export async function getSession(request: NextRequest): Promise<{ userId: string; email: string; role: string; status: string } | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (!token) {
    return null
  }

  return await verifySessionToken(token)
}

/**
 * Remove a sessão (logout)
 */
export function clearSession(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE)
  return response
}
