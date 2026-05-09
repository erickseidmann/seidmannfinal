import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cadastro de Professor | Seidmann Institute',
  description:
    'Formulário para professores se cadastrarem na Seidmann Institute. Após o envio, a equipe pedagógica entrará em contato para validar e liberar o acesso.',
}

export default function CadastroProfessorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
