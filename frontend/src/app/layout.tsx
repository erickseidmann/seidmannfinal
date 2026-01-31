/**
 * RootLayout
 * 
 * Layout raiz da aplicação.
 * Configura fontes, metadata e estrutura global.
 */

import type { Metadata } from 'next'
import { Inter, Poppins } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LanguageProvider } from '@/contexts/LanguageContext'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Seidmann Institute - Aprenda Inglês e Espanhol',
  description: 'Aprenda idiomas conversando de verdade. Professores nativos e brasileiros. Turmas reduzidas, todos os níveis, foco em conversação desde o primeiro dia.',
  keywords: ['inglês', 'espanhol', 'curso online', 'aulas online', 'idiomas', 'conversação'],
  authors: [{ name: 'Seidmann Institute' }],
  icons: {
    icon: [
      { url: '/images/logo/logo-icon.png', sizes: '32x32', type: 'image/png' },
      { url: '/images/logo/logo-icon.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/images/logo/logo-icon.png',
    apple: '/images/logo/logo-icon.png',
  },
  openGraph: {
    title: 'Seidmann Institute - Aprenda Inglês e Espanhol',
    description: 'Aprenda idiomas conversando de verdade. Professores nativos e brasileiros.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="scrollbar-brand">
      <body className={`${inter.variable} ${poppins.variable} font-sans min-h-screen flex flex-col bg-white`}>
        <LanguageProvider>
          <Header variant="transparent" />
          <main className="flex-1">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  )
}
