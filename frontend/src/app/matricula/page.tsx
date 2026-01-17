/**
 * Página de Matrícula
 * 
 * Formulário de cadastro para novos alunos com validação e integração WhatsApp
 */

'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import type { MatriculaResponse, ApiResponse } from '@/contracts/api.contract'

interface FormErrors {
  nome?: string
  whatsapp?: string
  email?: string
  idioma?: string
  nivel?: string
  disponibilidade?: string
  checkbox?: string
}

function MatriculaPageContent() {
  const searchParams = useSearchParams()
  const isAutoComplete = searchParams.get('auto') === '1'
  
  const [formData, setFormData] = useState({
    nome: '',
    whatsapp: '',
    email: '',
    idioma: '',
    nivel: '',
    objetivo: '',
    disponibilidade: '',
    checkbox: false,
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome completo é obrigatório'
    }

    if (!formData.whatsapp.trim()) {
      newErrors.whatsapp = 'WhatsApp é obrigatório'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email é obrigatório'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido'
    }

    if (!formData.idioma) {
      newErrors.idioma = 'Idioma é obrigatório'
    }

    if (!formData.nivel) {
      newErrors.nivel = 'Nível é obrigatório'
    }

    if (!formData.disponibilidade.trim()) {
      newErrors.disponibilidade = 'Disponibilidade é obrigatória'
    }

    if (!formData.checkbox) {
      newErrors.checkbox = 'Você precisa concordar para continuar'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setShowSuccess(false)
    setSubmitError(null)

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Fazer POST para API
      // O idioma já vem como "ENGLISH" ou "SPANISH" do select
      const response = await fetch('/api/matricula', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome: formData.nome,
          email: formData.email,
          whatsapp: formData.whatsapp,
          idioma: formData.idioma, // Já vem como "ENGLISH" ou "SPANISH"
          nivel: formData.nivel,
          objetivo: formData.objetivo || null,
          disponibilidade: formData.disponibilidade,
        }),
      })

      const json: ApiResponse<MatriculaResponse['data']> = await response.json()

      if (!response.ok || !json.ok) {
        // Melhorar mensagem de erro no UI
        const errorMessage = response.status === 400 
          ? json.message || 'Erro ao criar matrícula'
          : response.status === 503
          ? json.message || 'Banco de dados não está preparado. Verifique as configurações.'
          : response.status === 500
          ? 'Erro interno. Tente novamente em instantes.'
          : json.message || 'Erro ao criar matrícula'
        throw new Error(errorMessage)
      }

      // Sucesso - mostrar feedback e abrir WhatsApp
      setShowSuccess(true)

      // Construir mensagem para WhatsApp usando formato padronizado
      const enrollment = json.data.enrollment
      // Mapear enum de volta para label em português para WhatsApp
      const languageLabelMap: Record<string, string> = {
        'ENGLISH': 'Inglês',
        'SPANISH': 'Espanhol',
      }
      const languageLabel = enrollment.idioma 
        ? (languageLabelMap[enrollment.idioma] || enrollment.idioma)
        : 'Não informado'
      const mensagem = `Olá! Quero finalizar minha matrícula no Seidmann Institute.
ID Matrícula: ${enrollment.id}
Nome: ${enrollment.nome}
Idioma: ${languageLabel}
Nível: ${enrollment.nivel}
WhatsApp: ${enrollment.whatsapp}
Email: ${enrollment.email}
Disponibilidade: ${enrollment.disponibilidade || '-'}`

      const whatsappNumber = '5519987121980'
      const encodedMessage = encodeURIComponent(mensagem)
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`

      // Aguardar 800ms antes de abrir o WhatsApp
      setTimeout(() => {
        window.open(whatsappUrl, '_blank')
        setIsSubmitting(false)
      }, 800)
    } catch (error) {
      console.error('Erro ao criar matrícula:', error)
      setSubmitError(error instanceof Error ? error.message : 'Erro ao criar matrícula. Tente novamente.')
      setIsSubmitting(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))

    // Limpar erro do campo quando o usuário começar a digitar
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
          {/* Título e Subtítulo */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
              Matrícula
            </h1>
            <p className="text-lg text-gray-600">
              Preencha os dados e fale com a equipe para concluir sua matrícula.
            </p>
          </div>

          {/* Banner de autocomplete (quando auto=1) */}
          {isAutoComplete && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 font-semibold mb-2">
                Seu cadastro foi criado com sucesso!
              </p>
              <p className="text-blue-700 text-sm">
                Agora complete sua matrícula informando idioma, nível e disponibilidade para começarmos suas aulas.
              </p>
            </div>
          )}

          {/* Mensagem de sucesso */}
          {showSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              Matrícula criada com sucesso! Abrindo WhatsApp...
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
              {/* Nome Completo */}
              <div>
                <label htmlFor="nome" className="block text-sm font-semibold text-gray-700 mb-2">
                  Nome completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="nome"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  placeholder="Digite seu nome completo"
                  className={`input ${errors.nome ? 'border-red-500 focus:ring-red-500' : ''}`}
                  aria-invalid={errors.nome ? 'true' : 'false'}
                  aria-describedby={errors.nome ? 'nome-error' : undefined}
                />
                {errors.nome && (
                  <p id="nome-error" className="mt-1 text-sm text-red-600">
                    {errors.nome}
                  </p>
                )}
              </div>

              {/* Grid: WhatsApp e Email */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* WhatsApp */}
                <div>
                  <label htmlFor="whatsapp" className="block text-sm font-semibold text-gray-700 mb-2">
                    WhatsApp <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    id="whatsapp"
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleChange}
                    placeholder="(19) 99999-9999"
                    className={`input ${errors.whatsapp ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.whatsapp ? 'true' : 'false'}
                    aria-describedby={errors.whatsapp ? 'whatsapp-error' : undefined}
                  />
                  {errors.whatsapp && (
                    <p id="whatsapp-error" className="mt-1 text-sm text-red-600">
                      {errors.whatsapp}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="seu@email.com"
                    className={`input ${errors.email ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.email ? 'true' : 'false'}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                  />
                  {errors.email && (
                    <p id="email-error" className="mt-1 text-sm text-red-600">
                      {errors.email}
                    </p>
                  )}
                </div>
              </div>

              {/* Grid: Idioma e Nível */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Idioma */}
                <div>
                  <label htmlFor="idioma" className="block text-sm font-semibold text-gray-700 mb-2">
                    Idioma <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="idioma"
                    name="idioma"
                    value={formData.idioma}
                    onChange={handleChange}
                    className={`input ${errors.idioma ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.idioma ? 'true' : 'false'}
                    aria-describedby={errors.idioma ? 'idioma-error' : undefined}
                  >
                    <option value="">Selecione um idioma</option>
                    <option value="ENGLISH">Inglês</option>
                    <option value="SPANISH">Espanhol</option>
                  </select>
                  {errors.idioma && (
                    <p id="idioma-error" className="mt-1 text-sm text-red-600">
                      {errors.idioma}
                    </p>
                  )}
                </div>

                {/* Nível */}
                <div>
                  <label htmlFor="nivel" className="block text-sm font-semibold text-gray-700 mb-2">
                    Nível <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="nivel"
                    name="nivel"
                    value={formData.nivel}
                    onChange={handleChange}
                    className={`input ${errors.nivel ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.nivel ? 'true' : 'false'}
                    aria-describedby={errors.nivel ? 'nivel-error' : undefined}
                  >
                    <option value="">Selecione seu nível</option>
                    <option value="Iniciante">Iniciante</option>
                    <option value="Básico">Básico</option>
                    <option value="Intermediário">Intermediário</option>
                    <option value="Avançado">Avançado</option>
                  </select>
                  {errors.nivel && (
                    <p id="nivel-error" className="mt-1 text-sm text-red-600">
                      {errors.nivel}
                    </p>
                  )}
                </div>
              </div>

              {/* Objetivo (Opcional) */}
              <div>
                <label htmlFor="objetivo" className="block text-sm font-semibold text-gray-700 mb-2">
                  Objetivo <span className="text-gray-500 text-xs">(opcional)</span>
                </label>
                <textarea
                  id="objetivo"
                  name="objetivo"
                  value={formData.objetivo}
                  onChange={handleChange}
                  placeholder="Ex: trabalho, viagem, conversação, prova..."
                  rows={3}
                  className="input resize-none"
                />
              </div>

              {/* Disponibilidade */}
              <div>
                <label htmlFor="disponibilidade" className="block text-sm font-semibold text-gray-700 mb-2">
                  Disponibilidade <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="disponibilidade"
                  name="disponibilidade"
                  value={formData.disponibilidade}
                  onChange={handleChange}
                  placeholder="Ex: Seg/Qua 19h; Ter/Qui 7h"
                  rows={2}
                  className={`input resize-none ${errors.disponibilidade ? 'border-red-500 focus:ring-red-500' : ''}`}
                  aria-invalid={errors.disponibilidade ? 'true' : 'false'}
                  aria-describedby={errors.disponibilidade ? 'disponibilidade-error' : undefined}
                />
                {errors.disponibilidade && (
                  <p id="disponibilidade-error" className="mt-1 text-sm text-red-600">
                    {errors.disponibilidade}
                  </p>
                )}
              </div>

              {/* Checkbox */}
              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="checkbox"
                    checked={formData.checkbox}
                    onChange={handleChange}
                    className="mt-1 w-4 h-4 text-brand-orange border-gray-300 rounded focus:ring-brand-orange focus:ring-2"
                    aria-invalid={errors.checkbox ? 'true' : 'false'}
                    aria-describedby={errors.checkbox ? 'checkbox-error' : undefined}
                  />
                  <span className="text-sm text-gray-700">
                    Concordo em ser contatado pela equipe do Seidmann Institute via WhatsApp e e-mail.{' '}
                    <span className="text-red-500">*</span>
                  </span>
                </label>
                {errors.checkbox && (
                  <p id="checkbox-error" className="mt-1 text-sm text-red-600 ml-7">
                    {errors.checkbox}
                  </p>
                )}
              </div>

              {/* Botões */}
              <div className="space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Abrindo WhatsApp...' : 'Enviar e falar no WhatsApp'}
                  </Button>
                  <Button
                    href="/"
                    variant="outline"
                    size="lg"
                    className="flex-1"
                  >
                    Voltar para a Home
                  </Button>
                </div>
                <Button
                  href="/cadastro"
                  variant="outline"
                  size="lg"
                  className="w-full"
                >
                  Já fiz a matrícula — Quero me cadastrar
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </main>
  )
}

export default function MatriculaPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center">
              <p className="text-gray-600">Carregando...</p>
            </div>
          </div>
        </div>
      </main>
    }>
      <MatriculaPageContent />
    </Suspense>
  )
}
