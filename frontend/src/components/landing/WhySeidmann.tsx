/**
 * WhySeidmann.tsx
 * 
 * Seção "Por que Seidmann?" com diferenciais.
 */

import { Globe, Users, Clock, Award, BookOpen, Headphones } from 'lucide-react'

const benefits = [
  {
    icon: Globe,
    title: 'Aulas Online',
    description: 'Estude de qualquer lugar, no horário que preferir',
  },
  {
    icon: Users,
    title: 'Turmas Reduzidas',
    description: 'Máximo de 3 alunos por turma para atenção personalizada',
  },
  {
    icon: Clock,
    title: 'Horários Flexíveis',
    description: 'Ajuste seus horários conforme sua rotina',
  },
  {
    icon: Award,
    title: 'Professores Qualificados',
    description: 'Nativos e brasileiros experientes e certificados',
  },
  {
    icon: BookOpen,
    title: 'Todos os Níveis',
    description: 'Do iniciante ao avançado, sempre com foco em conversação',
  },
  {
    icon: Headphones,
    title: 'Suporte Dedicado',
    description: 'Equipe pronta para ajudar em qualquer momento',
  },
]

export default function WhySeidmann() {
  return (
    <section className="py-20 bg-gradient-to-b from-white to-orange-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
            Por que Seidmann?
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Diferenciais que fazem a diferença no seu aprendizado
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100"
            >
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-brand-orange to-brand-yellow flex items-center justify-center mb-4">
                <benefit.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-display font-bold text-brand-text mb-2">
                {benefit.title}
              </h3>
              <p className="text-gray-600">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
