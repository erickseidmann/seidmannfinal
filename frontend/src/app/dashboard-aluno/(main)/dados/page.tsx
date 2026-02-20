/**
 * Dashboard Aluno – Meus dados (visualização + edição de nome e WhatsApp).
 */

'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'

interface Aluno {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  idioma: string | null
  nivel: string | null
  objetivo: string | null
  disponibilidade: string | null
  dataNascimento: string | null
  nomeResponsavel: string | null
  emailResponsavel: string | null
  curso: string | null
  frequenciaSemanal: string | null
  tempoAulaMinutos: number | null
  tipoAula: string | null
  nomeGrupo: string | null
  valorMensalidade: string | null
  metodoPagamento: string | null
  diaPagamento: number | null
  status: string
  criadoEm: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default function DadosAlunoPage() {
  const [aluno, setAluno] = useState<Aluno | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome: '', whatsapp: '' })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/student/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.aluno) {
          const a = json.data.aluno
          setAluno(a)
          setForm({
            nome: a.nome || '',
            whatsapp: a.whatsapp || '',
          })
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setSaving(true)
    try {
      const res = await fetch('/api/student/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nome: form.nome.trim(),
          whatsapp: form.whatsapp.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setMessage({ type: 'error', text: json.message || 'Erro ao salvar' })
        return
      }
      setMessage({ type: 'success', text: 'Dados atualizados com sucesso.' })
      if (json.data?.aluno) setAluno(json.data.aluno)
    } catch {
      setMessage({ type: 'error', text: 'Erro ao salvar. Tente novamente.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-gray-500">Carregando...</p>
  }

  if (!aluno) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Meus dados</h1>
        <p className="text-gray-600">Matrícula ativa não encontrada.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Meus dados</h1>
      <p className="text-gray-600 mb-6">
        Suas informações de matrícula. Você pode alterar nome e WhatsApp. O e-mail é usado para login e não pode ser alterado aqui.
      </p>

      {message && (
        <div
          className={`mb-4 p-4 rounded-lg text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-md space-y-4 mb-8">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Nome completo *</label>
          <input
            type="text"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp</label>
          <input
            type="text"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            className="input w-full"
            placeholder="11999999999"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">E-mail</label>
          <input
            type="email"
            value={aluno.email ?? ''}
            className="input w-full bg-gray-100"
            readOnly
            disabled
          />
          <p className="text-xs text-gray-500 mt-1">E-mail é usado para login. Alterações devem ser feitas pela administração.</p>
        </div>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </form>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Informações da matrícula (somente leitura)</h2>
        <p className="text-sm text-gray-500">Estes dados são definidos pela administração.</p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {aluno.idioma && (
            <>
              <dt className="text-gray-500">Idioma</dt>
              <dd className="font-medium text-gray-900">{aluno.idioma}</dd>
            </>
          )}
          {aluno.nivel && (
            <>
              <dt className="text-gray-500">Nível</dt>
              <dd className="font-medium text-gray-900">{aluno.nivel}</dd>
            </>
          )}
          {aluno.objetivo && (
            <>
              <dt className="text-gray-500">Objetivo</dt>
              <dd className="font-medium text-gray-900">{aluno.objetivo}</dd>
            </>
          )}
          {aluno.disponibilidade && (
            <>
              <dt className="text-gray-500">Disponibilidade</dt>
              <dd className="font-medium text-gray-900">{aluno.disponibilidade}</dd>
            </>
          )}
          {aluno.dataNascimento && (
            <>
              <dt className="text-gray-500">Data de nascimento</dt>
              <dd className="font-medium text-gray-900">{formatDate(aluno.dataNascimento)}</dd>
            </>
          )}
          {aluno.nomeResponsavel && (
            <>
              <dt className="text-gray-500">Nome do responsável</dt>
              <dd className="font-medium text-gray-900">{aluno.nomeResponsavel}</dd>
            </>
          )}
          {(aluno as { emailResponsavel?: string | null }).emailResponsavel && (
            <>
              <dt className="text-gray-500">E-mail do responsável</dt>
              <dd className="font-medium text-gray-900">{(aluno as { emailResponsavel: string }).emailResponsavel}</dd>
            </>
          )}
          {aluno.curso && (
            <>
              <dt className="text-gray-500">Curso</dt>
              <dd className="font-medium text-gray-900">{aluno.curso}</dd>
            </>
          )}
          {aluno.frequenciaSemanal && (
            <>
              <dt className="text-gray-500">Frequência semanal</dt>
              <dd className="font-medium text-gray-900">{aluno.frequenciaSemanal}</dd>
            </>
          )}
          {aluno.tempoAulaMinutos != null && (
            <>
              <dt className="text-gray-500">Duração da aula</dt>
              <dd className="font-medium text-gray-900">{aluno.tempoAulaMinutos} min</dd>
            </>
          )}
          {aluno.tipoAula && (
            <>
              <dt className="text-gray-500">Tipo de aula</dt>
              <dd className="font-medium text-gray-900">{aluno.tipoAula}</dd>
            </>
          )}
          {aluno.nomeGrupo && (
            <>
              <dt className="text-gray-500">Grupo</dt>
              <dd className="font-medium text-gray-900">{aluno.nomeGrupo}</dd>
            </>
          )}
          {aluno.valorMensalidade && (
            <>
              <dt className="text-gray-500">Valor da mensalidade</dt>
              <dd className="font-medium text-gray-900">R$ {Number(aluno.valorMensalidade).toFixed(2).replace('.', ',')}</dd>
            </>
          )}
          {aluno.metodoPagamento && (
            <>
              <dt className="text-gray-500">Método de pagamento</dt>
              <dd className="font-medium text-gray-900">{aluno.metodoPagamento}</dd>
            </>
          )}
          {aluno.diaPagamento != null && (
            <>
              <dt className="text-gray-500">Dia de pagamento</dt>
              <dd className="font-medium text-gray-900">{aluno.diaPagamento}º do mês</dd>
            </>
          )}
          <dt className="text-gray-500">Status</dt>
          <dd className="font-medium text-gray-900">{aluno.status}</dd>
          <dt className="text-gray-500">Matrícula desde</dt>
          <dd className="font-medium text-gray-900">{formatDate(aluno.criadoEm)}</dd>
        </dl>
      </div>
    </div>
  )
}
