/**
 * Footer.tsx
 * 
 * Footer global da aplicação.
 * Links, contato e redes sociais.
 */

import Logo from '../branding/Logo'
import { MessageCircle, Mail } from 'lucide-react'
import Link from 'next/link'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-brand-text text-white py-12">
      <div className="container-content">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Logo e descrição */}
          <div>
            <Logo variant="icon" size="md" useFallback={true} className="mb-4" />
            <p className="text-gray-400 text-sm leading-relaxed">
              Aprenda Inglês e Espanhol com foco real em conversação. 
              Professores nativos e brasileiros, turmas reduzidas.
            </p>
          </div>

          {/* Links rápidos */}
          <div>
            <h3 className="font-display font-bold text-lg mb-4">Links Rápidos</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/matricula" className="text-gray-400 hover:text-brand-yellow transition-colors">
                  Matrícula
                </Link>
              </li>
              <li>
                <Link href="/status" className="text-gray-400 hover:text-brand-yellow transition-colors">
                  Acompanhar status
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-gray-400 hover:text-brand-yellow transition-colors">
                  Login
                </Link>
              </li>
              <li>
                <Link href="/#como-funciona" className="text-gray-400 hover:text-brand-yellow transition-colors">
                  Como Funciona
                </Link>
              </li>
              <li>
                <Link href="/#planos" className="text-gray-400 hover:text-brand-yellow transition-colors">
                  Planos
                </Link>
              </li>
            </ul>
          </div>

          {/* Informações */}
          <div>
            <h3 className="font-display font-bold text-lg mb-4">Informações</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/#faq" className="text-gray-400 hover:text-brand-yellow transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="#" className="text-gray-400 hover:text-brand-yellow transition-colors">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link href="#" className="text-gray-400 hover:text-brand-yellow transition-colors">
                  Termos de Uso
                </Link>
              </li>
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="font-display font-bold text-lg mb-4">Contato</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-brand-orange flex-shrink-0" />
                <a
                  href="https://wa.me/5519987121980"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-brand-yellow transition-colors"
                >
                  Fale no WhatsApp
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-brand-orange flex-shrink-0" />
                <a
                  href="mailto:atendimento@seidmanninstitute.com"
                  className="text-gray-400 hover:text-brand-yellow transition-colors"
                >
                  atendimento@seidmanninstitute.com
                </a>
              </li>
              <li className="text-gray-400 text-sm">
                +55 19 98712-1980
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-700 pt-8 text-center text-gray-400 text-sm">
          <p>&copy; {currentYear} Seidmann Institute. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  )
}
