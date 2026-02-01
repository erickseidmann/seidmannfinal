/**
 * Financeiro – Relatórios
 */

'use client'

import AdminLayout from '@/components/admin/AdminLayout'

export default function FinanceiroRelatoriosPage() {
  return (
    <AdminLayout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Financeiro – Relatórios</h1>
        <p className="text-gray-600 mt-1">Relatórios e exportações financeiras.</p>
        <div className="mt-8 p-6 bg-white rounded-xl border border-gray-200 text-center text-gray-500">
          Em breve: relatórios por período, por categoria e exportação.
        </div>
      </div>
    </AdminLayout>
  )
}
