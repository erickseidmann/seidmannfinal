/**
 * Página de Pagamento
 * 
 * Configuração de informações de pagamento
 */

'use client'

import { useState, FormEvent } from 'react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface FormErrors {
  plan?: string
  valorCombinado?: string
  vencimento?: string
}

const PLANOS = [
  { value: '1h_semanal', label: '1h semanal (Individual)' },
  { value: '2h_semanais', label: '2h semanais (Individual)' },
  { value: '2.5h_semanais', label: '2.5h semanais (Individual)' },
  { value: 'grupo_2h', label: 'Grupo - 2h semanais' },
  { value: 'outro', label: 'Outro (combinar)' },
]

export default function PagamentoPage() {
  const [formData, setFormData] = useState({
    plan: '',
    valorCombinado: '',
    metodo: 'PIX',
    vencimento: '',
    lembrete: true,
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.plan.trim()) {
      newErrors.plan = 'Plano é obrigatório'
    }

    if (!formData.valorCombinado.trim()) {
      newErrors.valorCombinado = 'Valor combinado é obrigatório'
    } else {
      const valorNum = Number(formData.valorCombinado.replace(',', '.'))
      if (isNaN(valorNum) || valorNum <= 0) {
        newErrors.valorCombinado = 'Valor deve ser um número positivo'
      }
    }

    if (!formData.vencimento.trim()) {
      newErrors.vencimento = 'Dia de vencimento é obrigatório'
    } else {
      const vencimentoNum = Number(formData.vencimento)
      if (isNaN(vencimentoNum) || vencimentoNum < 1 || vencimentoNum > 31) {
        newErrors.vencimento = 'Dia deve ser entre 1 e 31'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitError(null)
    setShowSuccess(false)

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/pagamento', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan: formData.plan,
          valorCombinado: formData.valorCombinado.replace(',', '.'),
          metodo: formData.metodo,
          vencimento: Number(formData.vencimento),
          lembrete: formData.lembrete,
        }),
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao processar pagamento')
      }

      // Sucesso
      setShowSuccess(true)
      setIsSubmitting(false)
    } catch (error) {
      console.error('Erro ao processar pagamento:', error)
      setSubmitError(error instanceof Error ? error.message : 'Erro ao processar pagamento. Tente novamente.')
      setIsSubmitting(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))

    // Limpar erro do campo
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }))
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
              Informações de Pagamento
            </h1>
            <p className="text-lg text-gray-600">
              Configure seu plano e dados de pagamento
            </p>
          </div>

          {/* Mensagem de sucesso */}
          {showSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-semibold mb-2">
                Informações recebidas!
              </p>
              <p className="text-green-700 text-sm">
                Aguarde confirmação para liberar seu login. Você receberá um e-mail quando estiver tudo pronto.
              </p>
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
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Plano */}
              <div>
                <label htmlFor="plan" className="block text-sm font-semibold text-gray-700 mb-2">
                  Plano <span className="text-red-500">*</span>
                </label>
                <select
                  id="plan"
                  name="plan"
                  value={formData.plan}
                  onChange={handleChange}
                  className={`input ${errors.plan ? 'border-red-500 focus:ring-red-500' : ''}`}
                  aria-invalid={errors.plan ? 'true' : 'false'}
                >
                  <option value="">Selecione um plano</option>
                  {PLANOS.map((plano) => (
                    <option key={plano.value} value={plano.value}>
                      {plano.label}
                    </option>
                  ))}
                </select>
                {errors.plan && (
                  <p className="mt-1 text-sm text-red-600">{errors.plan}</p>
                )}
              </div>

              {/* Valor Combinado */}
              <div>
                <label htmlFor="valorCombinado" className="block text-sm font-semibold text-gray-700 mb-2">
                  Valor combinado (R$) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="valorCombinado"
                  name="valorCombinado"
                  value={formData.valorCombinado}
                  onChange={handleChange}
                  placeholder="0.00"
                  className={`input ${errors.valorCombinado ? 'border-red-500 focus:ring-red-500' : ''}`}
                  aria-invalid={errors.valorCombinado ? 'true' : 'false'}
                />
                {errors.valorCombinado && (
                  <p className="mt-1 text-sm text-red-600">{errors.valorCombinado}</p>
                )}
              </div>

              {/* Método de Pagamento (PIX fixo) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Método de pagamento
                </label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-gray-700 font-medium">PIX</span>
                </div>
              </div>

              {/* Dia de Vencimento */}
              <div>
                <label htmlFor="vencimento" className="block text-sm font-semibold text-gray-700 mb-2">
                  Dia de vencimento (1-31) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="vencimento"
                  name="vencimento"
                  value={formData.vencimento}
                  onChange={handleChange}
                  placeholder="Ex: 10"
                  min="1"
                  max="31"
                  className={`input ${errors.vencimento ? 'border-red-500 focus:ring-red-500' : ''}`}
                  aria-invalid={errors.vencimento ? 'true' : 'false'}
                />
                {errors.vencimento && (
                  <p className="mt-1 text-sm text-red-600">{errors.vencimento}</p>
                )}
              </div>

              {/* Lembrete de Vencimento */}
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="lembrete"
                  name="lembrete"
                  checked={formData.lembrete}
                  onChange={handleChange}
                  className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                />
                <label htmlFor="lembrete" className="ml-3 text-sm text-gray-700">
                  Receber lembrete de vencimento por e-mail
                </label>
              </div>

              {/* Botões */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processando...' : 'Finalizar'}
                </Button>
                <Button
                  href="/contrato"
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
