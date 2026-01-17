/**
 * Página de Cadastro
 * 
 * Formulário de cadastro para alunos que já fizeram a matrícula
 */

'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { CadastroResponse, ApiResponse } from '@/contracts/api.contract'

interface FormErrors {
  nome?: string
  whatsapp?: string
  email?: string
  senha?: string
  confirmarSenha?: string
}

export default function CadastroPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    nome: '',
    whatsapp: '',
    email: '',
    senha: '',
    confirmarSenha: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdUser, setCreatedUser] = useState<{ name: string } | null>(null)

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

    if (!formData.senha) {
      newErrors.senha = 'Senha é obrigatória'
    } else if (formData.senha.length < 8) {
      newErrors.senha = 'Senha deve ter no mínimo 8 caracteres'
    }

    if (!formData.confirmarSenha) {
      newErrors.confirmarSenha = 'Confirmação de senha é obrigatória'
    } else if (formData.senha !== formData.confirmarSenha) {
      newErrors.confirmarSenha = 'As senhas não coincidem'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setShowSuccess(false)
    setSubmitError(null)
    setCreatedUser(null)

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Fazer POST para API
      const response = await fetch('/api/cadastro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome: formData.nome,
          email: formData.email,
          whatsapp: formData.whatsapp,
          senha: formData.senha,
        }),
      })

      const json: ApiResponse<CadastroResponse['data']> = await response.json()

      if (!response.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao criar conta')
      }

      // Sucesso - redirecionar para /contrato
      // Fluxo: cadastro -> contrato -> pagamento -> (admin aprova) -> login
      setIsSubmitting(false)
      
      // Redirecionar após um breve delay para dar feedback visual
      setTimeout(() => {
        router.push('/contrato')
      }, 500)
    } catch (error) {
      console.error('Erro ao criar conta:', error)
      setSubmitError(error instanceof Error ? error.message : 'Erro ao criar conta. Tente novamente.')
      setIsSubmitting(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))

    // Limpar erro do campo quando o usuário começar a digitar
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }))
    }

    // Se estiver editando confirmarSenha e a senha mudou, limpar erro de confirmarSenha também
    if (name === 'senha' && errors.confirmarSenha) {
      setErrors((prev) => ({
        ...prev,
        confirmarSenha: undefined,
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
              Cadastro
            </h1>
            <p className="text-lg text-gray-600">
              Crie sua conta para começar as aulas.
            </p>
          </div>

          {/* Mensagem de sucesso */}
          {showSuccess && createdUser && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-semibold mb-2">
                Cadastro criado com sucesso!
              </p>
              <p className="text-green-700 text-sm mb-4">
                Bem-vindo, {createdUser.name}!
              </p>
              <Button href="/login" variant="primary" size="md" className="w-full">
                Ir para Login
              </Button>
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
                  autoComplete="name"
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
                    autoComplete="tel"
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
                    autoComplete="email"
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

              {/* Grid: Senha e Confirmar Senha */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Senha */}
                <div>
                  <label htmlFor="senha" className="block text-sm font-semibold text-gray-700 mb-2">
                    Senha <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="senha"
                    name="senha"
                    value={formData.senha}
                    onChange={handleChange}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    className={`input ${errors.senha ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.senha ? 'true' : 'false'}
                    aria-describedby={errors.senha ? 'senha-error' : undefined}
                  />
                  {errors.senha && (
                    <p id="senha-error" className="mt-1 text-sm text-red-600">
                      {errors.senha}
                    </p>
                  )}
                </div>

                {/* Confirmar Senha */}
                <div>
                  <label htmlFor="confirmarSenha" className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirmar senha <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="confirmarSenha"
                    name="confirmarSenha"
                    value={formData.confirmarSenha}
                    onChange={handleChange}
                    placeholder="Digite a senha novamente"
                    autoComplete="new-password"
                    className={`input ${errors.confirmarSenha ? 'border-red-500 focus:ring-red-500' : ''}`}
                    aria-invalid={errors.confirmarSenha ? 'true' : 'false'}
                    aria-describedby={errors.confirmarSenha ? 'confirmarSenha-error' : undefined}
                  />
                  {errors.confirmarSenha && (
                    <p id="confirmarSenha-error" className="mt-1 text-sm text-red-600">
                      {errors.confirmarSenha}
                    </p>
                  )}
                </div>
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
                  {isSubmitting ? 'Enviando...' : 'Criar conta e começar'}
                </Button>
                <Button
                  href="/login"
                  variant="outline"
                  size="lg"
                  className="flex-1"
                >
                  Já tenho conta — Fazer login
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </main>
  )
}
