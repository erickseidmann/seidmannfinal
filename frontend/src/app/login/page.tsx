/**
 * Página de Login
 * 
 * Login para alunos e administradores com toggle entre modos
 */

'use client'

import { useState, FormEvent, useEffect } from 'react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import type { LoginResponse, ApiResponse } from '@/contracts/api.contract'

interface FormErrors {
  email?: string
  password?: string
}

export default function LoginPage() {
  const [mode, setMode] = useState<'aluno' | 'admin'>('aluno')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggedUser, setLoggedUser] = useState<{ name: string } | null>(null)

  // Atualizar modo quando URL mudar (query param tab=admin ou admin=1)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('tab') === 'admin' || urlParams.get('admin') === '1') {
        setMode('admin')
      }
    }
  }, [])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.email.trim()) {
      newErrors.email = 'Email é obrigatório'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido'
    }

    if (!formData.password) {
      newErrors.password = 'Senha é obrigatória'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoginError(null)
    setLoginSuccess(false)
    setLoggedUser(null)

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Escolher endpoint baseado no modo
      const endpoint = mode === 'admin' ? '/api/admin/login' : '/api/login'
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Importante para cookies httpOnly
        body: JSON.stringify({
          email: formData.email,
          senha: formData.password,
        }),
      })

      const json: ApiResponse<any> = await response.json()

      if (!response.ok || !json.ok) {
        if (response.status === 403) {
          setLoginError(json.message || 'Acesso ainda não liberado. Finalize contrato/pagamento ou aguarde confirmação.')
        } else {
          setLoginError(json.message || 'Erro ao fazer login')
        }
        setIsSubmitting(false)
        return
      }

      // Sucesso
      setLoginSuccess(true)
      setLoggedUser({ name: json.data.user.nome || json.data.user.email })
      setIsSubmitting(false)

      // Redirecionar
      if (mode === 'admin') {
        // Admin vai para dashboard
        setTimeout(() => {
          window.location.href = '/admin/dashboard'
        }, 1000)
      } else {
        // Aluno redireciona conforme resposta
        const redirectTo = json.data.redirectTo || '/'
        setTimeout(() => {
          window.location.href = redirectTo
        }, 1000)
      }

      // Limpar formulário
      setFormData({
        email: '',
        password: '',
      })
    } catch (error) {
      console.error('Erro ao fazer login:', error)
      setLoginError(error instanceof Error ? error.message : 'Erro ao fazer login. Tente novamente.')
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))

    // Limpar erro do campo quando o usuário começar a digitar
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }))
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
      <div className="container mx-auto px-4">
        <div className="max-w-md mx-auto">
          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
              Login
            </h1>
          </div>

          {/* Toggle Aluno/Admin */}
          <Card className="p-6 mb-6">
            <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('aluno')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-colors ${
                  mode === 'aluno'
                    ? 'bg-white text-brand-orange shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Aluno
              </button>
              <button
                type="button"
                onClick={() => setMode('admin')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-colors ${
                  mode === 'admin'
                    ? 'bg-white text-brand-orange shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Admin
              </button>
            </div>
          </Card>

          {/* Mensagem de sucesso */}
          {loginSuccess && loggedUser && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-semibold mb-2">
                Bem-vindo, {loggedUser.name}!
              </p>
              <p className="text-green-700 text-sm">Redirecionando...</p>
            </div>
          )}

          {/* Mensagem de erro */}
          {loginError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-semibold mb-2">
                {loginError}
              </p>
              {mode === 'aluno' && loginError.includes('acesso ainda não foi liberado') && (
                <div className="mt-4 space-y-3">
                  <p className="text-red-700 text-sm">
                    Aguarde liberação do acesso. Se você já fez o pagamento, entre em contato com a escola.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      href="/"
                      variant="outline"
                      size="md"
                      className="flex-1"
                    >
                      Voltar
                    </Button>
                    <Link href="/status" className="flex-1">
                      <Button
                        variant="primary"
                        size="md"
                        className="w-full"
                      >
                        Acompanhar status
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Card do Formulário */}
          {!loginSuccess && (
            <Card className="p-6 md:p-8">
              {/* Mini Header: Já sou aluno + Acompanhar status (apenas modo aluno) */}
              {mode === 'aluno' && (
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Já sou aluno
                    </h2>
                    <Link
                      href="/status"
                      className="text-sm font-medium text-brand-orange hover:text-orange-700 transition-colors"
                    >
                      Acompanhar status →
                    </Link>
                  </div>
                </div>
              )}

              {mode === 'admin' && (
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Acesso administrativo
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Use as credenciais configuradas no servidor
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="seu@email.com"
                    autoComplete="email"
                    className={`input ${errors.email ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.email ? 'true' : 'false'}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>

                {/* Senha */}
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                    Senha <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    className={`input ${errors.password ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.password ? 'true' : 'false'}
                  />
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                  )}
                </div>

                {/* Botões */}
                <div className="flex flex-col gap-4 pt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Entrando...' : 'Entrar'}
                  </Button>
                  {mode === 'aluno' && (
                    <Button
                      href="/cadastro"
                      variant="outline"
                      size="lg"
                      className="w-full"
                    >
                      Criar conta
                    </Button>
                  )}
                </div>
              </form>

              {/* Mensagem sobre acesso (apenas modo aluno) */}
              {mode === 'aluno' && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">
                    Se seu acesso ainda não foi liberado, aguarde a confirmação do pagamento.
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
