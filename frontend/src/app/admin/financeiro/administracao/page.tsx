/**
 * Financeiro – Administração
 */

'use client'

import AdminLayout from '@/components/admin/AdminLayout'

export default function FinanceiroAdministracaoPage() {
  return (
    <AdminLayout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Financeiro – Administração</h1>
        <p className="text-gray-600 mt-1">Custos e despesas de administração.</p>
        <div className="mt-8 p-6 bg-white rounded-xl border border-gray-200 text-center text-gray-500">
          Em breve: painel de despesas administrativas.
        </div>
      </div>
    </AdminLayout>
  )
}
