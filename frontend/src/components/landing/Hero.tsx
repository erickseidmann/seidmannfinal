/**
 * Hero.tsx
 * 
 * Seção hero com headline, CTAs e imagem de aluno.
 */

'use client'

import Image from 'next/image'
import Button from '../ui/Button'
import { Users, User, UserCheck, MessageCircle, Monitor } from 'lucide-react'
import { createWhatsAppLink, WHATSAPP_MESSAGES } from '@/lib/whatsapp'

const formats = [
  {
    icon: UserCheck,
    name: 'Trio',
    description: '3 alunos por turma',
    color: 'from-blue-500 to-blue-600',
  },
  {
    icon: Users,
    name: 'Dupla',
    description: '2 alunos por turma',
    color: 'from-purple-500 to-purple-600',
  },
  {
    icon: User,
    name: 'Particular',
    description: 'Aula individual',
    color: 'from-brand-orange to-brand-yellow',
  },
]

export default function Hero() {
  const scrollToSection = (href: string) => {
    const element = document.querySelector(href)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <section id="inicio" className="pt-24 pb-20 bg-gradient-to-b from-orange-50 to-white">
      <div className="container mx-auto px-4">
        {/* Layout 2 colunas: Texto + Imagem */}
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto mb-16">
          {/* Coluna esquerda: Headline e CTAs */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-brand-text mb-6 leading-tight">
              Aprenda Inglês ou Espanhol com foco real em{' '}
              <span className="bg-gradient-to-r from-brand-orange to-brand-yellow bg-clip-text text-transparent">
                conversação
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed">
              Aulas online • Todos os níveis • Professores nativos e brasileiros • Turmas reduzidas
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button href="/matricula" size="lg">
                Matricule-se
              </Button>
              <Button 
                href={createWhatsAppLink(WHATSAPP_MESSAGES.evaluation)} 
                variant="outline" 
                size="lg"
                className="flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Falar no WhatsApp
              </Button>
            </div>
          </div>

          {/* Coluna direita: Imagem do aluno */}
          <div className="relative order-first lg:order-last">
            <div className="relative w-full h-[400px] lg:h-[500px] rounded-2xl overflow-hidden shadow-xl">
              <Image
                src="/images/people/student-1.jpeg"
                alt="Aluna estudando no Seidmann Institute"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              {/* Badge "Aulas Online" */}
              <div className="absolute top-6 right-6 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                <Monitor className="w-4 h-4 text-brand-orange" />
                <span className="text-sm font-semibold text-brand-text">Aulas Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Formatos */}
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16">
          {formats.map((format) => (
            <div
              key={format.name}
              className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100"
            >
              <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${format.color} flex items-center justify-center mb-4 mx-auto`}>
                <format.icon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-display font-bold text-brand-text mb-2 text-center">
                {format.name}
              </h3>
              <p className="text-gray-600 text-center">{format.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
