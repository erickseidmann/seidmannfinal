import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Matrícula | Seidmann Institute',
  description: 'Preencha o formulário e comece suas aulas de Inglês ou Espanhol com o Seidmann Institute.',
}

export default function MatriculaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
