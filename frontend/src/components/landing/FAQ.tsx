/**
 * FAQ.tsx
 * 
 * Seção de perguntas frequentes com accordion.
 */

'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const faqs = [
  {
    question: 'Quais níveis são oferecidos?',
    answer: 'Oferecemos todos os níveis, do iniciante (A1) ao avançado (C2). Fazemos uma avaliação inicial para identificar seu nível atual e definir o melhor plano de estudos.',
  },
  {
    question: 'Como funcionam os horários?',
    answer: 'Oferecemos horários flexíveis durante todo o dia. Você pode escolher o melhor horário para você e, se necessário, reagendar com até 24h de antecedência.',
  },
  {
    question: 'Posso cancelar minha matrícula?',
    answer: 'Sim, você pode cancelar a qualquer momento. Entre em contato conosco e resolveremos de forma rápida e transparente.',
  },
  {
    question: 'Preciso comprar material didático?',
    answer: 'Não! Todo o material é digital e está incluído no seu plano. Você terá acesso a materiais exclusivos através da nossa plataforma.',
  },
  {
    question: 'Como são escolhidos os professores?',
    answer: 'Você pode escolher seu professor ou deixar que indiquemos o melhor para seu perfil e objetivos. Todos os nossos professores são qualificados e experientes.',
  },
  {
    question: 'E se eu perder uma aula?',
    answer: 'Você pode reagendar sua aula com até 24h de antecedência. Em casos de emergência, entre em contato conosco e avaliaremos a possibilidade de reposição.',
  },
  {
    question: 'As aulas são gravadas?',
    answer: 'As aulas são ao vivo e interativas. Algumas aulas podem ser gravadas com sua autorização para revisão posterior, mas o foco é sempre na interação em tempo real.',
  },
  {
    question: 'Quanto tempo leva para ficar fluente?',
    answer: 'O tempo varia conforme seu nível inicial, frequência das aulas e dedicação. Em média, alunos que fazem 2-3 aulas por semana alcançam fluência conversacional em 12-18 meses.',
  },
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section id="faq" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
            Perguntas Frequentes
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Tire suas dúvidas sobre nossos cursos e metodologia
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={faq.question}
              className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden hover:border-brand-orange transition-colors"
            >
              <button
                onClick={() => toggle(index)}
                className="w-full px-6 py-4 flex items-center justify-between text-left"
                aria-expanded={openIndex === index}
              >
                <span className="font-semibold text-brand-text pr-4">
                  {faq.question}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-brand-orange flex-shrink-0 transition-transform ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-6 pb-4 text-gray-600 leading-relaxed">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
