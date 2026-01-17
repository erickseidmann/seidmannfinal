/**
 * Landing Page
 *
 * Página inicial do Seidmann Institute focada em conversão.
 */

import type { Metadata } from 'next'

import Hero from '@/components/landing/Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import WhySeidmann from '@/components/landing/WhySeidmann'
import Methodology from '@/components/landing/Methodology'
import PeopleGallery from '@/components/landing/PeopleGallery'
import Teachers from '@/components/landing/Teachers'
import Pricing from '@/components/landing/Pricing'
import Testimonials from '@/components/landing/Testimonials'
import FAQ from '@/components/landing/FAQ'

export const metadata: Metadata = {
  title: 'Seidmann Institute - Aprenda Inglês e Espanhol com Foco em Conversação',
  description:
    'Aulas online de Inglês e Espanhol com professores nativos e brasileiros. Turmas reduzidas, todos os níveis, foco em conversação desde o primeiro dia.',
}

export default function Home() {
  return (
    <main className="flex flex-col">
      <Hero />
      <HowItWorks />
      <WhySeidmann />
      <Methodology />
      <PeopleGallery />
      <Teachers />
      <Pricing />
      <Testimonials />
      <FAQ />
    </main>
  )
}
