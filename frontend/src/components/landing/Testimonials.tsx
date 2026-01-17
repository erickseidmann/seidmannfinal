/**
 * Testimonials.tsx
 * 
 * Seção de prova social com depoimentos e métricas.
 * Carrossel automático com 7 depoimentos, exibindo 3 por vez no desktop e 1 no mobile.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { Star, ChevronLeft, ChevronRight } from 'lucide-react'

const testimonials = [
  {
    name: 'Alane Gomes',
    role: 'Aluna de Inglês',
    quote: 'Entrei na Seidmann Institute com um inglês intermediário, onde eu compreendia o que era falado, mas não conseguia falar.\nEm 4 meses já estou conseguindo manter uma conversa 100% em inglês com as professoras e com uma evolução perceptível por todos da minha convivência.\nJá tinha tentado outro curso de inglês antes, porém não me adaptei, sendo o método usado pelo Seidmann Institute o mais completo na minha opinião.',
    rating: 5,
  },
  {
    name: 'Paulo e Jéssica',
    role: 'Alunos de Inglês',
    quote: 'Estamos fazendo esse curso de inglês sensacional na escola Seidmann Institute. Estamos gostando muito porque nunca vimos, em nenhuma outra escola que cursamos, tal didática e proficiência.\nEstamos muito felizes, porque os professores são excelentes e sabemos que é só o começo!',
    rating: 5,
  },
  {
    name: 'Ana Clara',
    role: 'Aluna de Inglês',
    quote: 'Meu nome é Ana Clara e estou cursando inglês no Seidmann Institute há um tempo e tenho amado desde o primeiro dia.\nNão tenho nada a reclamar das aulas e dos professores, são aulas com dinâmicas diferentes e professores muito amigáveis.\nMeu inglês evoluiu muito desde que entrei e me sinto muito feliz por esse progresso.',
    rating: 5,
  },
  {
    name: 'Aline e Sophia',
    role: 'Alunas de Inglês',
    quote: 'Desde o primeiro dia nos apaixonamos pelo Seidmann Institute.\nPossui professores competentes que ministram aulas dinâmicas e de qualidade, o que facilita o nosso aprendizado.\nEscola mais que top!',
    rating: 5,
  },
  {
    name: 'Paula Pureza',
    role: 'Aluna de Inglês',
    quote: 'As aulas são adequadas às minhas necessidades, com horários flexíveis.\nOs professores são fantásticos, o teacher Erick é excepcional e, pela primeira vez após milhares de tentativas, tenho 2 anos de assiduidade nas aulas, o que sempre foi um desafio para mim.',
    rating: 5,
  },
  {
    name: 'Rosângela',
    role: 'Aluna de Inglês',
    quote: 'Escolhi a escola Seidmann Institute por indicação de um amigo que atua no mercado internacional.\nTambém por dificuldades em aprender a língua e por necessidade profissional.\nPreciso de horários versáteis e foi a melhor escolha, pois consegui me interessar mais, absorver mais no online.\nHoje posso fazer aula de onde estiver, com aulas divertidas fora da rotina.\nO inglês virou parte da minha rotina diária. Parabéns e obrigada por toda dedicação!',
    rating: 5,
  },
  {
    name: 'Gabrielly Soares',
    role: 'Aluna de Inglês',
    quote: 'Já fiz alguns cursos de inglês e nenhum se compara ao Seidmann.\nAs aulas foram adaptadas à minha necessidade, com professores incríveis e competentes.\nIndico para todos os meus amigos!',
    rating: 5,
  },
]

const metrics = [
  { value: '+1.0000', label: 'Alunos formados' },
  { value: '+50.000', label: 'Horas de aula' },
  { value: '98%', label: 'Satisfação' },
  { value: '12', label: 'Países atendidos' },
]

const AUTOPLAY_INTERVAL = 5000 // 5 segundos

export default function Testimonials() {
  const [pageIndex, setPageIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [cardsPerView, setCardsPerView] = useState(3) // Desktop: 3, Mobile: 1
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const total = testimonials.length

  // Detectar tamanho da tela para ajustar cards por visualização
  useEffect(() => {
    const updateCardsPerView = () => {
      const newCardsPerView = window.innerWidth >= 768 ? 3 : 1
      setCardsPerView((prev) => {
        if (prev !== newCardsPerView) {
          // Se mudou, recalcular pageIndex
          const newPages = Math.ceil(total / newCardsPerView)
          setPageIndex((currentIndex) => {
            return currentIndex >= newPages ? 0 : currentIndex
          })
        }
        return newCardsPerView
      })
    }

    updateCardsPerView()
    window.addEventListener('resize', updateCardsPerView)
    return () => window.removeEventListener('resize', updateCardsPerView)
  }, [total])

  const pages = Math.ceil(total / cardsPerView)

  // Calcular quais depoimentos exibir (com wrap infinito)
  const getVisibleTestimonials = () => {
    const start = pageIndex * cardsPerView
    const visible = []
    for (let i = 0; i < cardsPerView; i++) {
      const index = (start + i) % total
      visible.push(testimonials[index])
    }
    return visible
  }

  const visibleTestimonials = getVisibleTestimonials()

  // Navegação
  const goToNext = () => {
    setPageIndex((prev) => (prev + 1) % pages)
  }

  const goToPrev = () => {
    setPageIndex((prev) => (prev - 1 + pages) % pages)
  }

  const goToPage = (index: number) => {
    setPageIndex(index)
  }

  // Autoplay com pausa ao passar o mouse
  useEffect(() => {
    if (isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      setPageIndex((prev) => (prev + 1) % pages)
    }, AUTOPLAY_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPaused, pages])

  return (
    <section className="py-20 bg-gradient-to-b from-orange-50 to-white">
      <div className="container mx-auto px-4">
        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20 max-w-4xl mx-auto">
          {metrics.map((metric) => (
            <div key={metric.label} className="text-center">
              <div className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-r from-brand-orange to-brand-yellow bg-clip-text text-transparent mb-2">
                {metric.value}
              </div>
              <p className="text-gray-600 font-medium">{metric.label}</p>
            </div>
          ))}
        </div>

        {/* Depoimentos */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
            O que Nossos Alunos Dizem
          </h2>
        </div>

        {/* Carrossel Container */}
        <div
          className="relative max-w-6xl mx-auto"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Botão Anterior */}
          <button
            onClick={goToPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-12 z-10 bg-white rounded-full p-2 shadow-lg hover:shadow-xl transition-shadow border border-gray-200 hover:border-brand-orange"
            aria-label="Depoimento anterior"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700 hover:text-brand-orange transition-colors" />
          </button>

          {/* Botão Próximo */}
          <button
            onClick={goToNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-12 z-10 bg-white rounded-full p-2 shadow-lg hover:shadow-xl transition-shadow border border-gray-200 hover:border-brand-orange"
            aria-label="Próximo depoimento"
          >
            <ChevronRight className="w-6 h-6 text-gray-700 hover:text-brand-orange transition-colors" />
          </button>

          {/* Cards de Depoimentos */}
          <div className={`grid gap-8 ${cardsPerView === 3 ? 'md:grid-cols-3' : 'grid-cols-1'}`}>
            {visibleTestimonials.map((testimonial, idx) => (
              <div
                key={`${testimonial.name}-${pageIndex}-${idx}`}
                className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 transition-opacity duration-300"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-5 h-5 fill-brand-yellow text-brand-yellow"
                    />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 italic leading-relaxed whitespace-pre-line">
                  "{testimonial.quote}"
                </p>
                <div>
                  <p className="font-semibold text-brand-text">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bullets Indicadores */}
          <div className="flex justify-center gap-2 mt-8">
            {Array.from({ length: pages }).map((_, index) => (
              <button
                key={index}
                onClick={() => goToPage(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  pageIndex === index
                    ? 'w-8 bg-brand-orange'
                    : 'w-2 bg-gray-300 hover:bg-gray-400'
                }`}
                aria-label={`Ir para página ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
