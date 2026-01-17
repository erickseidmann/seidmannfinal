/**
 * Pricing.tsx
 * 
 * Seção de planos (Trio, Dupla, Particular).
 */

import { UserCheck, Users, User, Check, MessageCircle } from 'lucide-react'
import Button from '../ui/Button'
import { createWhatsAppLink, WHATSAPP_MESSAGES } from '@/lib/whatsapp'

const plans = [
  {
    icon: UserCheck,
    name: 'Trio',
    forWho: 'Ideal para quem quer economia e interação',
    benefits: [
      '3 alunos por turma',
      'Atenção personalizada',
      'Custo-benefício excelente',
      'Horários flexíveis',
    ],
    color: 'from-blue-500 to-blue-600',
  },
  {
    icon: Users,
    name: 'Dupla',
    forWho: 'Perfeito para praticar com um colega',
    benefits: [
      '2 alunos por turma',
      'Mais tempo de fala',
      'Motivação em dupla',
      'Preço intermediário',
    ],
    color: 'from-purple-500 to-purple-600',
  },
  {
    icon: User,
    name: 'Particular',
    forWho: 'Máxima personalização e foco',
    benefits: [
      'Aula 100% individual',
      'Ritmo totalmente seu',
      'Foco nas suas necessidades',
      'Avanço mais rápido',
    ],
    color: 'from-brand-orange to-brand-yellow',
    popular: true,
  },
]

export default function Pricing() {
  return (
    <section id="planos" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
            Escolha Seu Plano
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Formatos pensados para diferentes necessidades e orçamentos
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white p-8 rounded-3xl shadow-lg hover:shadow-xl transition-all border-2 ${
                plan.popular
                  ? 'border-brand-orange scale-105'
                  : 'border-gray-100'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-brand-orange to-brand-yellow text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Mais Popular
                  </span>
                </div>
              )}

              <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${plan.color} flex items-center justify-center mx-auto mb-6`}>
                <plan.icon className="w-8 h-8 text-white" />
              </div>

              <h3 className="text-2xl font-display font-bold text-brand-text mb-2 text-center">
                {plan.name}
              </h3>
              <p className="text-gray-600 text-center mb-6">{plan.forWho}</p>

              <div className="space-y-3 mb-8">
                {plan.benefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-brand-orange flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <Button
                  href={`/matricula?plano=${plan.name.toLowerCase()}`}
                  className="w-full"
                  size="lg"
                >
                  Matricular
                </Button>
                <a
                  href={createWhatsAppLink(WHATSAPP_MESSAGES.evaluation)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 text-sm font-medium text-brand-orange border-2 border-brand-orange rounded-lg hover:bg-brand-orange hover:text-white transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Agendar avaliação
                </a>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 max-w-2xl mx-auto">
          * Horários e valores podem variar. Entre em contato para uma avaliação personalizada e 
          conheça os planos disponíveis no momento.
        </p>
      </div>
    </section>
  )
}
