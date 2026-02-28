/**
 * Página: Redefinir senha (acessada pelo link no e-mail).
 * Query: token. Formulário: nova senha + confirmação.
 */

'use client'

import { useState, FormEvent, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useTranslation } from '@/contexts/LanguageContext'

function RedefinirSenhaForm() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const tokenFromUrl = searchParams.get('token') || ''

  const [token, setToken] = useState(tokenFromUrl)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setToken(tokenFromUrl)
  }, [tokenFromUrl])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    if (!token.trim()) {
      setError(t('resetPassword.invalidLink'))
      return
    }
    if (newPassword.length < 6) {
      setError(t('resetPassword.minLength'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('resetPassword.passwordMismatch'))
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), newPassword }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        setError(json.message || t('resetPassword.error'))
        return
      }
      setSuccess(true)
    } catch {
      setError(t('resetPassword.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!tokenFromUrl) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
                {t('resetPassword.title')}
              </h1>
            </div>
            <Card className="p-6 md:p-8">
              <p className="text-gray-600 mb-6">{t('resetPassword.invalidLink')}</p>
              <Link href="/recuperar-senha">
                <Button variant="primary" size="lg" className="w-full">
                  {t('forgotPassword.title')}
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </main>
    )
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
                {t('resetPassword.title')}
              </h1>
            </div>
            <Card className="p-6 md:p-8">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
                <p className="text-green-800 font-semibold">{t('resetPassword.success')}</p>
              </div>
              <Link href="/login">
                <Button variant="primary" size="lg" className="w-full">
                  {t('forgotPassword.backToLogin')}
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
      <div className="container mx-auto px-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
              {t('resetPassword.title')}
            </h1>
            <p className="text-gray-600">{t('resetPassword.subtitle')}</p>
          </div>

          <Card className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}
              <div>
                <label htmlFor="newPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('resetPassword.newPassword')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  minLength={6}
                  className="input w-full"
                />
                <p className="mt-1 text-xs text-gray-500">{t('resetPassword.minLengthHint')}</p>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('resetPassword.confirmPassword')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  minLength={6}
                  className="input w-full"
                />
              </div>
              <div className="flex flex-col gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? t('resetPassword.saving') : t('resetPassword.submit')}
                </Button>
                <Link href="/login">
                  <Button variant="outline" size="lg" className="w-full">
                    {t('forgotPassword.backToLogin')}
                  </Button>
                </Link>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </main>
  )
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20 flex items-center justify-center">
        <p className="text-gray-500">Carregando...</p>
      </main>
    }>
      <RedefinirSenhaForm />
    </Suspense>
  )
}
