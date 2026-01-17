/**
 * Teachers.tsx
 * 
 * Seção sobre professores brasileiros e nativos.
 */

import { Globe, GraduationCap } from 'lucide-react'

const teacherTypes = [
  {
    icon: Globe,
    title: 'Professores Nativos',
    description: 'Pronúncia autêntica e cultura real com mais de 10 anos de experiência.',
  },
  {
    icon: GraduationCap,
    title: 'Professores Brasileiros',
    description: 'Experientes e certificados, que entendem as dificuldades específicas de quem fala português.',
  },
]

export default function Teachers() {
  return (
    <section id="professores" className="py-20 bg-gradient-to-b from-white to-orange-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
            Professores Brasileiros e Nativos
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            A melhor combinação para seu aprendizado
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {teacherTypes.map((type) => (
            <div
              key={type.title}
              className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-brand-orange to-brand-yellow flex items-center justify-center mb-6">
                <type.icon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-display font-bold text-brand-text mb-4">
                {type.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">{type.description}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
