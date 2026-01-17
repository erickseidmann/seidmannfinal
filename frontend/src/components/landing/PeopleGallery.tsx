/**
 * PeopleGallery.tsx
 * 
 * Galeria de imagens de pessoas (professores e alunos).
 * Usa imagens reais de public/images/people/
 */

import Image from 'next/image'

interface PeopleImage {
  src: string
  alt: string
}

// Imagens reais de professores, alunos e grupos (PNG)
const peopleImages: PeopleImage[] = [
  {
    src: '/images/people/student-3.png',
    alt: 'Professora em aula online de Inglês',
  },
  {
    src: '/images/people/student-4.png',
    alt: 'Professor nativo em aula',
  },
  {
    src: '/images/people/student-5.png',
    alt: 'Aluna estudando Espanhol',
  },
  {
    src: '/images/people/student-6.png',
    alt: 'Aluno praticando conversação',
  },
  {
    src: '/images/people/student-7.png',
    alt: 'Turma em videochamada',
  },
  {
    src: '/images/people/student-8.png',
    alt: 'Ambiente de estudo online em grupo',
  },
]

export default function PeopleGallery() {
  return (
    <section className="py-20 bg-gradient-to-b from-white to-orange-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-brand-text mb-4">
            Pessoas reais. Conversação real.
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Professores e alunos de todos os níveis, conectados online.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {peopleImages.map((image, index) => (
            <div
              key={index}
              className="relative group overflow-hidden rounded-2xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300"
            >
              <div className="relative w-full h-64">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
