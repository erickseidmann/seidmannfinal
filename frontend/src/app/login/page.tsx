/**
 * Página de Login
 *
 * Login único: identifica automaticamente se é aluno ou admin pelas credenciais.
 */

'use client'

import { useState, FormEvent } from 'react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import { useTranslation } from '@/contexts/LanguageContext'
import type { ApiResponse } from '@/contracts/api.contract'

interface FormErrors {
  email?: string
  password?: string
}

export default function LoginPage() {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggedUser, setLoggedUser] = useState<{ name: string } | null>(null)

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.email.trim()) {
      newErrors.email = t('login.emailRequired')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('login.emailInvalid')
    }

    if (!formData.password) {
      newErrors.password = t('login.passwordRequired')
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
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email,
          senha: formData.password,
        }),
      })

      let json: ApiResponse<any>
      try {
        const text = await response.text()
        json = text ? (JSON.parse(text) as ApiResponse<any>) : { ok: false, message: 'Resposta vazia' }
      } catch {
        setLoginError(response.status >= 500 ? 'Erro no servidor. Verifique se o banco de dados está ativo e tente novamente.' : 'Erro ao processar resposta.')
        setIsSubmitting(false)
        return
      }

      if (!response.ok || !json.ok) {
        const msg = (json as { message?: string }).message
        if (response.status === 403) {
          setLoginError(msg || 'Acesso ainda não liberado. Finalize contrato/pagamento ou aguarde confirmação.')
        } else {
          setLoginError(msg || 'Erro ao fazer login')
        }
        setIsSubmitting(false)
        return
      }

      setLoginSuccess(true)
      setLoggedUser({ name: json.data.user.nome || json.data.user.email })
      setIsSubmitting(false)

      const redirectTo = json.data.redirectTo || '/'
      setTimeout(() => {
        window.location.href = redirectTo
      }, 1000)

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
              {t('login.title')}
            </h1>
          </div>

          {/* Mensagem de sucesso */}
          {loginSuccess && loggedUser && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-semibold mb-2">
                {t('login.welcome')}, {loggedUser.name}!
              </p>
              <p className="text-green-700 text-sm">{t('login.redirecting')}</p>
            </div>
          )}

          {/* Mensagem de erro */}
          {loginError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-semibold mb-2">
                {loginError}
              </p>
              {loginError.includes('liberad') && (
                <div className="mt-4 space-y-3">
                  <p className="text-red-700 text-sm">
                    {t('login.awaitAccess')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      href="/"
                      variant="outline"
                      size="md"
                      className="flex-1"
                    >
                      {t('login.back')}
                    </Button>
                    <Link href="/status" className="flex-1">
                      <Button
                        variant="primary"
                        size="md"
                        className="w-full"
                      >
                        {t('nav.trackStatus')}
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
              <div className="mb-6 pb-6 border-b border-gray-200">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {t('login.alreadyHaveAccount')}
                  </h2>
                  <Link
                    href="/status"
                    className="text-sm font-medium text-brand-orange hover:text-orange-700 transition-colors"
                  >
                    {t('nav.trackStatus')} →
                  </Link>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('login.email')} <span className="text-red-500">*</span>
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
                    {t('login.password')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={t('login.passwordPlaceholder')}
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
                    {isSubmitting ? t('login.entering') : t('login.enter')}
                  </Button>
                  <Button
                    href="/cadastro"
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    {t('login.createAccount')}
                  </Button>
                </div>
              </form>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  {t('login.accessNotReleased')}
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
