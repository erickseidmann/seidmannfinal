/**
 * Gerenciamento de sessão admin usando cookies httpOnly com JWT
 * 
 * Implementação específica para autenticação de administradores
 */

import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

// Chave secreta para assinatura do JWT (usar variável de ambiente)
const SECRET_KEY = process.env.SESSION_SECRET || 'change-me-in-production-min-32-chars'
const ADMIN_COOKIE_NAME = 'admin_session'
const TOKEN_EXPIRY_DAYS = 7

/**
 * Interface do payload do token admin
 */
export interface AdminTokenPayload {
  sub: string // userId
  role: 'ADMIN'
  email: string
  adminPages?: string[] // Páginas do dashboard que pode acessar (só para não super-admin)
}

/**
 * Cria um token JWT assinado para admin
 */
async function signAdminToken(payload: AdminTokenPayload): Promise<string> {
  const secret = new TextEncoder().encode(SECRET_KEY)
  
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_EXPIRY_DAYS}d`)
    .sign(secret)

  return token
}

/**
 * Verifica e decodifica o token JWT da sessão admin
 */
async function verifyAdminToken(token: string): Promise<AdminTokenPayload | null> {
  try {
    const secret = new TextEncoder().encode(SECRET_KEY)
    const { payload } = await jwtVerify(token, secret)
    
    // Validar estrutura do payload
    if (!payload.sub || payload.role !== 'ADMIN' || !payload.email) {
      return null
    }
    
    return {
      sub: payload.sub as string,
      role: 'ADMIN',
      email: payload.email as string,
      adminPages: Array.isArray(payload.adminPages) ? (payload.adminPages as string[]) : undefined,
    }
  } catch (error) {
    return null
  }
}

/**
 * Define o cookie de sessão admin na resposta
 */
export async function setSessionCookie(
  response: NextResponse,
  payload: AdminTokenPayload
): Promise<NextResponse> {
  const token = await signAdminToken(payload)
  
  // Cookie httpOnly, secure em produção, sameSite para segurança CSRF
  // Path="/" garante que o cookie seja válido para todas as rotas
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * TOKEN_EXPIRY_DAYS, // 7 dias em segundos
    path: '/', // Importante: path="/" permite acesso em todas as rotas
  })

  return response
}

/**
 * Verifica a sessão admin atual e retorna os dados do token
 */
export async function getAdminSession(request: NextRequest): Promise<AdminTokenPayload | null> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value

  if (!token) {
    return null
  }

  return await verifyAdminToken(token)
}

/**
 * Remove o cookie de sessão admin (logout)
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  // Limpar cookie definindo valor vazio e expirando
  response.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Expirar imediatamente
    path: '/',
  })
  return response
}
