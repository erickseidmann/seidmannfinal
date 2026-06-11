/**
 * Financeiro – Recebimentos a conciliar
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/admin/AdminLayout'
import RecebimentosConciliacao from '@/components/admin/financeiro/RecebimentosConciliacao'
import Toast from '@/components/admin/Toast'
import { ArrowLeft } from 'lucide-react'

export default function RecebimentosConciliarPage() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  )

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <Link
            href="/admin/financeiro/alunos"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-orange mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para Financeiro – Alunos
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Recebimentos a conciliar
          </h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Vincule pagamentos recebidos (Cora, Santander e outros) aos alunos correspondentes.
          </p>
        </div>

        <RecebimentosConciliacao
          variant="page"
          onToast={(message, type) => setToast({ message, type })}
        />
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </AdminLayout>
  )
}
