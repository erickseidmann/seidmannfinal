/**
 * Página de Acompanhar Status
 * 
 * Consulta o status de uma matrícula usando o código de acompanhamento
 */

'use client'

import { useState, FormEvent } from 'react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'

interface StatusResponse {
  code: string
  status: string
  message: string
  nextSteps: string
  createdAt: string
}

export default function StatusPage() {
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusData, setStatusData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setStatusData(null)

    if (!code.trim()) {
      setError('Por favor, informe o código de acompanhamento')
      return
    }

    // Normalizar código (uppercase)
    const normalizedCode = code.trim().toUpperCase()

    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/status?code=${encodeURIComponent(normalizedCode)}`)
      const json = await response.json()

      if (!response.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao consultar status')
      }

      setStatusData(json.data)
      setCode('') // Limpar código após sucesso (privacidade)
    } catch (error) {
      console.error('Erro ao consultar status:', error)
      setError(error instanceof Error ? error.message : 'Erro ao consultar status. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Mapear status para cores e ícones
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'LEAD':
        return 'bg-blue-50 border-blue-200 text-blue-800'
      case 'REGISTERED':
        return 'bg-purple-50 border-purple-200 text-purple-800'
      case 'CONTRACT_ACCEPTED':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      case 'PAYMENT_PENDING':
        return 'bg-orange-50 border-orange-200 text-orange-800'
      case 'ACTIVE':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'BLOCKED':
        return 'bg-red-50 border-red-200 text-red-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800'
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
              Acompanhar Status
            </h1>
            <p className="text-lg text-gray-600">
              Digite o código da sua matrícula para ver o status atual
            </p>
          </div>

          {/* Card do Formulário */}
          <Card className="p-6 md:p-8 mb-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Input do Código */}
              <div>
                <label htmlFor="code" className="block text-sm font-semibold text-gray-700 mb-2">
                  Código de Acompanhamento <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="code"
                  name="code"
                  value={code}
                  onChange={(e) => {
                    // Automático uppercase e limitar formato
                    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
                    setCode(value)
                    setError(null)
                    setStatusData(null)
                  }}
                  placeholder="MAT-XXXXXXX"
                  maxLength={12} // MAT- + 8 caracteres
                  className="input font-mono text-center text-lg tracking-wider"
                  aria-invalid={error ? 'true' : 'false'}
                  autoComplete="off"
                />
                <p className="mt-2 text-xs text-gray-500">
                  O código foi enviado no momento da criação da sua matrícula
                </p>
              </div>

              {/* Mensagem de erro */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {error}
                </div>
              )}

              {/* Botão Consultar */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={isSubmitting || !code.trim()}
              >
                {isSubmitting ? 'Consultando...' : 'Consultar'}
              </Button>
            </form>
          </Card>

          {/* Resultado do Status */}
          {statusData && (
            <Card className="p-6 md:p-8">
              <div className={`p-4 rounded-lg border-2 mb-6 ${getStatusColor(statusData.status)}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-lg mb-2">
                      {statusData.message}
                    </p>
                    <p className="text-sm opacity-90">
                      Código: <span className="font-mono font-semibold">{statusData.code}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Próximos Passos */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Próximos Passos:</h3>
                <p className="text-gray-700 text-sm leading-relaxed">
                  {statusData.nextSteps}
                </p>
              </div>

              {/* Ações */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t">
                {statusData.status === 'LEAD' && (
                  <Button href="/cadastro" variant="primary" size="md" className="flex-1">
                    Criar Cadastro
                  </Button>
                )}
                {statusData.status === 'REGISTERED' && (
                  <Button href="/contrato" variant="primary" size="md" className="flex-1">
                    Assinar Contrato
                  </Button>
                )}
                {statusData.status === 'CONTRACT_ACCEPTED' && (
                  <Button href="/pagamento" variant="primary" size="md" className="flex-1">
                    Configurar Pagamento
                  </Button>
                )}
                {statusData.status === 'ACTIVE' && (
                  <Button href="/login" variant="primary" size="md" className="flex-1">
                    Fazer Login
                  </Button>
                )}
                <Button href="/" variant="outline" size="md" className="flex-1">
                  Voltar
                </Button>
              </div>
            </Card>
          )}

          {/* Ajuda */}
          {!statusData && (
            <div className="text-center mt-6">
              <p className="text-sm text-gray-600 mb-4">
                Não tem seu código? Entre em contato conosco:
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="https://wa.me/5519987121980"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button variant="outline" size="md">
                    WhatsApp
                  </Button>
                </a>
                <a href="mailto:atendimento@seidmanninstitute.com" className="inline-block">
                  <Button variant="outline" size="md">
                    E-mail
                  </Button>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
