/**
 * Dashboard Aluno – Alterar senha (obrigatório no primeiro acesso)
 */

'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'

export default function AlterarSenhaAlunoPage() {
  const router = useRouter()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (senhaNova.trim().length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (senhaNova !== confirmarSenha) {
      setError('A nova senha e a confirmação não coincidem.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/student/alterar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          senhaAtual: senhaAtual.trim(),
          senhaNova: senhaNova.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.message || 'Erro ao alterar senha.')
        setLoading(false)
        return
      }
      setSuccess(true)
      setSenhaAtual('')
      setSenhaNova('')
      setConfirmarSenha('')
      setTimeout(() => {
        router.replace('/dashboard-aluno')
      }, 1500)
    } catch {
      setError('Erro ao alterar senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">Área do Aluno – Alterar senha</h1>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 mb-6">
            Por segurança, você deve alterar sua senha no primeiro acesso. Use a senha padrão que você recebeu (123456) no campo &quot;Senha atual&quot;.
          </p>

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              Senha alterada com sucesso! Redirecionando para o dashboard...
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Senha atual <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                className="input w-full"
                placeholder="Ex.: 123456"
                required
                disabled={loading || success}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nova senha <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
                className="input w-full"
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                disabled={loading || success}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Confirmar nova senha <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                className="input w-full"
                placeholder="Repita a nova senha"
                required
                minLength={6}
                disabled={loading || success}
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={loading || success}
            >
              {loading ? 'Alterando...' : success ? 'Redirecionando...' : 'Alterar senha'}
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}
