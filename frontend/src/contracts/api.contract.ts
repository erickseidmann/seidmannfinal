/**
 * API Contract - Seidmann Institute
 * 
 * Contratos tipados para as respostas das APIs do sistema.
 * Garante type-safety em todas as chamadas de API.
 */

/**
 * Tipo base para resposta de sucesso
 */
export type ApiSuccess<T> = {
  ok: true
  data: T
}

/**
 * Tipo base para resposta de erro
 */
export type ApiError = {
  ok: false
  message: string
}

/**
 * Tipo união para qualquer resposta de API
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiError

/**
 * Enrollment (Matrícula)
 * Estrutura retornada pela API de matrícula
 */
export type Enrollment = {
  id: string
  nome: string
  email: string
  whatsapp: string
  idioma: 'ENGLISH' | 'SPANISH'
  nivel: string
  objetivo: string | null
  disponibilidade: string | null
  status: 'LEAD' | 'REGISTERED' | 'COMPLETED'
  createdAt: string // ISO date string
}

/**
 * User (Usuário)
 * Estrutura retornada pelas APIs de cadastro e login
 */
export type User = {
  id: string
  nome: string
  email: string
  whatsapp: string
  createdAt: string // ISO date string
}

/**
 * Resposta da API POST /api/matricula
 */
export type MatriculaResponse = ApiSuccess<{
  enrollment: Enrollment
}>

/**
 * Resposta da API POST /api/cadastro
 */
export type CadastroResponse = ApiSuccess<{
  user: User
}>

/**
 * Resposta da API POST /api/login
 */
export type LoginResponse = ApiSuccess<{
  user: User
}>

/**
 * Helper para verificar se a resposta é de sucesso
 */
export function isApiSuccess<T>(
  response: ApiResponse<T>
): response is ApiSuccess<T> {
  return response.ok === true
}

/**
 * Helper para verificar se a resposta é de erro
 */
export function isApiError(
  response: ApiResponse<unknown>
): response is ApiError {
  return response.ok === false
}
