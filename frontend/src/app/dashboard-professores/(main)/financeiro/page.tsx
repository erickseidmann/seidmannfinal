/**
 * Dashboard Professores – Financeiro (em breve)
 */

'use client'

import { Wallet } from 'lucide-react'

export default function FinanceiroPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Financeiro</h1>
      <p className="text-gray-600 mb-6">Informações financeiras e pagamentos.</p>
      <div className="max-w-md p-8 bg-amber-50 border border-amber-200 rounded-xl text-center">
        <Wallet className="w-12 h-12 text-amber-600 mx-auto mb-4" />
        <p className="font-medium text-amber-800">Em breve</p>
        <p className="text-sm text-amber-700 mt-1">
          Esta seção será implementada em breve. Você poderá acompanhar pagamentos e informações financeiras aqui.
        </p>
      </div>
    </div>
  )
}
