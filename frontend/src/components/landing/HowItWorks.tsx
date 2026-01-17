/**
 * HowItWorks.tsx
 * 
 * Seção "Como funciona" com passo a passo.
 */

import { ClipboardCheck, CreditCard, MessageCircle, TrendingUp } from 'lucide-react'

const steps = [
  {
    icon: ClipboardCheck,
    title: 'Avaliação',
    description: 'Fazemos uma avaliação para entender seu nível atual e objetivos',
  },
  {
    icon: CreditCard,
    title: 'Escolha seu plano',
    description: 'Selecione o formato ideal: Trio, Dupla ou Particular',
  },
  {
    icon: MessageCircle,
    title: 'Comece a falar',
    description: 'Aulas focadas em conversação desde o primeiro dia',
  },
  {
    icon: TrendingUp,
    title: 'Evolua constantemente',
    description: 'Acompanhe seu progresso e alcance a fluência',
  },
]

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
            Como Funciona
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Um processo simples e direto para você começar a falar outro idioma
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <div key={step.title} className="relative">
              <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 h-full">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-brand-orange to-brand-yellow flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">{index + 1}</span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                    <step.icon className="w-6 h-6 text-brand-orange" />
                  </div>
                </div>
                <h3 className="text-xl font-display font-bold text-brand-text mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
