/**
 * Página: Recuperar senha (esqueci a senha).
 * Usuário informa o e-mail e recebe um link para redefinir a senha.
 */

'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useTranslation } from '@/contexts/LanguageContext'

export default function RecuperarSenhaPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t('forgotPassword.invalidEmail'))
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        setError(json.message || t('forgotPassword.error'))
        return
      }
      setSent(true)
    } catch {
      setError(t('forgotPassword.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
      <div className="container mx-auto px-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
              {t('forgotPassword.title')}
            </h1>
            <p className="text-gray-600">
              {t('forgotPassword.subtitle')}
            </p>
          </div>

          {sent ? (
            <Card className="p-6 md:p-8">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
                <p className="text-green-800 font-semibold">
                  {t('forgotPassword.sent')}
                </p>
              </div>
              <Link href="/login">
                <Button variant="primary" size="lg" className="w-full">
                  {t('forgotPassword.backToLogin')}
                </Button>
              </Link>
            </Card>
          ) : (
            <Card className="p-6 md:p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800 text-sm">{error}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('login.email')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    autoComplete="email"
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
                    {isSubmitting ? t('forgotPassword.sending') : t('forgotPassword.send')}
                  </Button>
                  <Link href="/login" className="block">
                    <Button variant="outline" size="lg" className="w-full">
                      {t('forgotPassword.backToLogin')}
                    </Button>
                  </Link>
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
