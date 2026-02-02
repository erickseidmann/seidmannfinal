/**
 * Dashboard Aluno – Início
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { User, Wallet } from 'lucide-react'

interface Aluno {
  nome: string
}

export default function DashboardAlunoInicioPage() {
  const [aluno, setAluno] = useState<Aluno | null>(null)

  useEffect(() => {
    fetch('/api/student/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.aluno) setAluno(json.data.aluno)
      })
  }, [])

  const displayName = aluno?.nome || 'Aluno'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Olá, {displayName}!</h1>
      <p className="text-gray-600 mb-6">
        Bem-vindo ao seu painel. Use o menu ao lado para acessar seus dados e informações financeiras.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <Link
          href="/dashboard-aluno/dados"
          className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <User className="w-8 h-8 text-brand-orange mb-2" />
          <p className="font-semibold text-gray-900">Meus dados</p>
          <p className="text-sm text-gray-500 mt-1">Ver suas informações de matrícula e contato</p>
        </Link>
        <Link
          href="/dashboard-aluno/financeiro"
          className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <Wallet className="w-8 h-8 text-brand-orange mb-2" />
          <p className="font-semibold text-gray-900">Financeiro</p>
          <p className="text-sm text-gray-500 mt-1">Valor da mensalidade e status de pagamento</p>
        </Link>
      </div>
    </div>
  )
}
