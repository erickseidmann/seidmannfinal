/**
 * Dashboard Professores – Dados pessoais (editar)
 */

'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'

interface Professor {
  id: string
  nome: string
  nomePreferido: string | null
  email: string
  whatsapp: string | null
  cpf: string | null
  cnpj: string | null
  valorPorHora: string | null
  metodoPagamento: string | null
  infosPagamento: string | null
}

export default function DadosPessoaisPage() {
  const [professor, setProfessor] = useState<Professor | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome: '', nomePreferido: '', whatsapp: '', cpf: '', cnpj: '' })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/professor/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.professor) {
          const p = json.data.professor
          setProfessor(p)
          setForm({
            nome: p.nome || '',
            nomePreferido: p.nomePreferido || '',
            whatsapp: p.whatsapp || '',
            cpf: p.cpf || '',
            cnpj: p.cnpj || '',
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
      const res = await fetch('/api/professor/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nome: form.nome.trim(),
          nomePreferido: form.nomePreferido.trim() || null,
          whatsapp: form.whatsapp.trim() || null,
          cpf: form.cpf.trim() || null,
          cnpj: form.cnpj.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setMessage({ type: 'error', text: json.message || 'Erro ao salvar' })
        return
      }
      setMessage({ type: 'success', text: 'Dados atualizados com sucesso.' })
      if (json.data?.professor) setProfessor(json.data.professor)
    } catch {
      setMessage({ type: 'error', text: 'Erro ao salvar. Tente novamente.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-gray-500">Carregando...</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dados pessoais</h1>
      <p className="text-gray-600 mb-6">Atualize suas informações. O email é usado para login e não pode ser alterado aqui.</p>

      {message && (
        <div
          className={`mb-4 p-4 rounded-lg text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
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
          <label className="block text-sm font-semibold text-gray-700 mb-1">Nome que prefere ser chamado</label>
          <input
            type="text"
            value={form.nomePreferido}
            onChange={(e) => setForm({ ...form, nomePreferido: e.target.value })}
            className="input w-full"
            placeholder="Ex.: Maria"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={professor?.email ?? ''}
            className="input w-full bg-gray-100"
            readOnly
            disabled
          />
          <p className="text-xs text-gray-500 mt-1">Email é usado para login. Alterações devem ser feitas pela administração.</p>
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
          <label className="block text-sm font-semibold text-gray-700 mb-1">CPF</label>
          <input
            type="text"
            value={form.cpf}
            onChange={(e) => setForm({ ...form, cpf: e.target.value })}
            className="input w-full"
            placeholder="000.000.000-00"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">CNPJ</label>
          <input
            type="text"
            value={form.cnpj}
            onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
            className="input w-full"
            placeholder="00.000.000/0000-00"
          />
        </div>

        {(professor?.valorPorHora != null || professor?.metodoPagamento != null || (professor?.infosPagamento != null && professor.infosPagamento.trim() !== '')) && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700">Dados de pagamento (somente leitura)</p>
            <p className="text-xs text-gray-500">Alterações devem ser feitas pela administração.</p>
            {professor?.valorPorHora != null && professor.valorPorHora !== '' && (
              <p className="text-sm text-gray-800"><strong>Valor por hora:</strong> R$ {professor.valorPorHora}</p>
            )}
            {professor?.metodoPagamento != null && professor.metodoPagamento.trim() !== '' && (
              <p className="text-sm text-gray-800"><strong>Método de pagamento:</strong> {professor.metodoPagamento}</p>
            )}
            {professor?.infosPagamento != null && professor.infosPagamento.trim() !== '' && (
              <p className="text-sm text-gray-800"><strong>Informações de pagamento:</strong> {professor.infosPagamento}</p>
            )}
          </div>
        )}

        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </form>
    </div>
  )
}
