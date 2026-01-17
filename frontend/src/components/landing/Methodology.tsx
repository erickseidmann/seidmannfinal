/**
 * Methodology.tsx
 * 
 * Seção sobre metodologia focada em conversação.
 */

import { MessageCircle, CheckCircle } from 'lucide-react'

const examples = [
  'Situações do dia a dia (trabalho, viagens, estudos)',
  'Expressões reais usadas por nativos',
  'Correção em tempo real durante a conversa',
  'Prática constante de listening e speaking',
]

export default function Methodology() {
  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-brand-orange to-brand-yellow flex items-center justify-center mx-auto mb-6">
              <MessageCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
              Metodologia Focada em Conversação
            </h2>
            <p className="text-xl text-gray-600">
              Aqui você fala desde o primeiro dia, não apenas estuda teoria
            </p>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-8 md:p-12 rounded-3xl border border-orange-100">
            <p className="text-lg text-gray-700 mb-6 leading-relaxed">
              Na Seidmann, acreditamos que a melhor forma de aprender um idioma é falando. 
              Nossas aulas são 100% práticas, com diálogos reais, situações do cotidiano e 
              correção imediata. Você não vai decorar regras gramaticais - você vai usar o 
              idioma de verdade.
            </p>

            <div className="space-y-4">
                <h3 className="text-xl font-display font-bold text-brand-text mb-4">
                O que você vai praticar:
              </h3>
              {examples.map((example) => (
                <div key={example} className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-brand-orange flex-shrink-0 mt-0.5" />
                  <p className="text-gray-700">{example}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
