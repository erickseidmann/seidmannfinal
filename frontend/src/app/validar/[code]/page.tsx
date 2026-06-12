'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, CheckCircle2, FileText, XCircle } from 'lucide-react'
import SeidmannLoading from '@/components/ui/SeidmannLoading'
import { CERTIFICATE_INSTITUTE } from '@/lib/certificate-constants'

type PublicCertificate = {
  certificateNo: string
  typeLabel: string
  studentName: string
  studentCpf: string
  courseTitle: string
  totalHours: number
  issueDateFormatted: string
  periodStart: string | null
  periodEnd: string | null
  pdfPath: string
  validationUrl: string
}

export default function ValidarCertificadoPage({ params }: { params: { code: string } }) {
  const [loading, setLoading] = useState(true)
  const [cert, setCert] = useState<PublicCertificate | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = decodeURIComponent(params.code || '')
    fetch(`/api/public/certificates/validate/${encodeURIComponent(code)}`)
      .then(async (res) => {
        const json = await res.json()
        if (!json.ok) {
          setError(json.message || 'Certificado não encontrado')
          setCert(null)
          return
        }
        setCert(json.data)
        setError(null)
      })
      .catch(() => setError('Erro ao validar certificado'))
      .finally(() => setLoading(false))
  }, [params.code])

  const inst = CERTIFICATE_INSTITUTE

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <Award className="w-12 h-12 text-brand-orange mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Validação de certificado</h1>
          <p className="text-gray-600 mt-1 text-sm">Seidmann Institute</p>
        </div>

        {loading ? (
          <SeidmannLoading variant="section" message="Validando documento…" />
        ) : error || !cert ? (
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900">Documento inválido</h2>
            <p className="text-gray-600 mt-2 text-sm">{error || 'Certificado não encontrado ou desativado.'}</p>
            <Link href="/" className="inline-block mt-6 text-brand-orange font-medium hover:underline">
              Voltar ao site
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
            <div className="bg-emerald-50 px-6 py-4 flex items-center gap-3 border-b border-emerald-100">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
              <div>
                <p className="font-semibold text-emerald-900">Certificado autêntico</p>
                <p className="text-sm text-emerald-800">Certificado nº {cert.certificateNo}</p>
              </div>
            </div>

            <div className="p-6 space-y-4 text-sm text-gray-700">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Aluno</p>
                <p className="font-semibold text-gray-900 text-lg">{cert.studentName}</p>
                <p>CPF: {cert.studentCpf}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Documento</p>
                <p className="font-medium">{cert.typeLabel}</p>
                <p className="mt-1">{cert.courseTitle}</p>
              </div>
              {(cert.periodStart || cert.periodEnd) && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Período</p>
                  <p>
                    {cert.periodStart || '—'} a {cert.periodEnd || '—'}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Carga horária</p>
                  <p className="font-medium">{cert.totalHours} horas</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Emissão</p>
                  <p className="font-medium">{cert.issueDateFormatted}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 text-xs text-gray-600 leading-relaxed">
                <p>
                  {inst.city}, {cert.issueDateFormatted}.
                </p>
                <p className="font-semibold text-gray-800 mt-2">{inst.name}</p>
                <p>CNPJ {inst.cnpj}</p>
                <p>{inst.addressLine1}</p>
                <p>{inst.addressLine2}</p>
                <p>{inst.addressLine3}</p>
                <p className="mt-3 font-semibold text-gray-800">{inst.directorName}</p>
                <p>{inst.directorTitle}</p>
              </div>

              <a
                href={cert.pdfPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl bg-brand-orange text-white font-medium hover:bg-orange-600 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Baixar PDF do certificado
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
