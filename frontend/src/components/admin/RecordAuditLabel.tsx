'use client'

import { formatRecordAuditText } from '@/lib/record-audit'

type RecordAuditLabelProps = {
  criadoEm?: string | Date | null
  atualizadoEm?: string | Date | null
  createdByName?: string | null
  updatedByName?: string | null
  cadastroViaImportacaoLista?: boolean | null
}

export default function RecordAuditLabel(props: RecordAuditLabelProps) {
  const text = formatRecordAuditText(props)
  if (!text) return null
  return <p className="mt-0.5 text-[11px] leading-snug text-gray-500 whitespace-nowrap">{text}</p>
}
