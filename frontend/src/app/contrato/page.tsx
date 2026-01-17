/**
 * Página de Contrato
 * 
 * Aceite do contrato antes de configurar pagamento
 */

'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function ContratoPage() {
  const router = useRouter()
  const [aceite, setAceite] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitError(null)
    setShowSuccess(false)

    if (!aceite) {
      setSubmitError('Você precisa aceitar o contrato para continuar')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/contrato', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aceite: true,
        }),
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao aceitar contrato')
      }

      // Sucesso - redirecionar para /pagamento
      setShowSuccess(true)
      setIsSubmitting(false)

      setTimeout(() => {
        router.push('/pagamento')
      }, 1000)
    } catch (error) {
      console.error('Erro ao aceitar contrato:', error)
      setSubmitError(error instanceof Error ? error.message : 'Erro ao aceitar contrato. Tente novamente.')
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
              Contrato e Termos
            </h1>
            <p className="text-lg text-gray-600">
              Leia e aceite os termos para continuar
            </p>
          </div>

          {/* Mensagem de sucesso */}
          {showSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              Contrato aceito! Redirecionando para pagamento...
            </div>
          )}

          {/* Mensagem de erro */}
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {submitError}
            </div>
          )}

          {/* Card do Formulário */}
          <Card className="p-6 md:p-8">
            {/* Texto do Contrato */}
            <div className="mb-8 space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Termos e Condições</h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <section>
                    <h3 className="font-semibold text-gray-900">Pagamentos</h3>
                    <p className="text-gray-700">
                      Os pagamentos devem ser realizados mensalmente até o dia de vencimento acordado. 
                      Atrasos podem resultar em suspensão temporária das aulas.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-900">Cancelamento do Curso e Trocas de Horários</h3>
                    <p className="text-gray-700">
                      O cancelamento do curso requer aviso prévio de 30 dias. Trocas de horários estão 
                      sujeitas à disponibilidade e devem ser solicitadas com antecedência.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-900">Cancelamento de Aulas</h3>
                    <p className="text-gray-700">
                      Aulas canceladas com menos de 24 horas de antecedência não serão repostas. 
                      Cancelamentos com aviso prévio serão remarcados conforme disponibilidade.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-900">Férias e Feriados</h3>
                    <p className="text-gray-700">
                      Durante períodos de férias escolares e feriados, as aulas podem ser ajustadas ou 
                      suspensas. Os alunos serão avisados com antecedência.
                    </p>
                  </section>

                  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Nota:</strong> Este é um resumo dos termos principais. O contrato completo 
                      estará disponível após a aprovação do pagamento.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Checkbox de Aceite */}
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="aceite"
                  checked={aceite}
                  onChange={(e) => setAceite(e.target.checked)}
                  className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  required
                />
                <label htmlFor="aceite" className="ml-3 text-sm text-gray-700">
                  <span className="font-semibold">Li e concordo</span> com os termos e condições acima
                </label>
              </div>

              {/* Botões */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  disabled={isSubmitting || !aceite}
                >
                  {isSubmitting ? 'Processando...' : 'Continuar para pagamento'}
                </Button>
                <Button
                  href="/"
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  Voltar
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </main>
  )
}
