'use client'

import Link from 'next/link'
import { Hash } from 'lucide-react'
import { useRecebimentosPendentesCount } from '@/hooks/useRecebimentosPendentesCount'

export default function RecebimentosConciliarNavButton() {
  const { pendentes } = useRecebimentosPendentesCount()
  const hasPendentes = pendentes > 0

  return (
    <Link
      href="/admin/financeiro/recebimentos"
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border font-medium text-sm transition-colors ${
        hasPendentes
          ? 'animate-blink-alert border-orange-400 bg-orange-50 text-orange-900 hover:bg-orange-100 shadow-sm'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      }`}
      title={
        hasPendentes
          ? `${pendentes} recebimento(s) pendente(s) de conciliação`
          : 'Conciliar recebimentos bancários'
      }
    >
      <Hash className="w-4 h-4 shrink-0" />
      Recebimentos a conciliar
      {hasPendentes && (
        <span className="rounded-full bg-gradient-to-r from-[#FF5200] to-[#FFAA00] px-2 py-0.5 text-xs font-bold text-white">
          {pendentes}
        </span>
      )}
    </Link>
  )
}
