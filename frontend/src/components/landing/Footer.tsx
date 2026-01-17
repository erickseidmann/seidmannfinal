/**
 * Footer.tsx
 * 
 * Rodapé completo com links, contato e redes sociais.
 */

import { MessageCircle, Mail, Instagram } from 'lucide-react'
import Link from 'next/link'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-seidmann-dark text-white py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Logo e descrição */}
          <div>
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-gradient-seidmann flex items-center justify-center">
                  <span className="text-white font-display font-bold text-xl">S</span>
                </div>
                <span className="text-xl font-display font-bold text-white">
                  Seidmann Institute
                </span>
              </div>
            </div>
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
                <Link href="/matricula" className="text-gray-400 hover:text-seidmann-gold transition-colors">
                  Matrícula
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-gray-400 hover:text-seidmann-gold transition-colors">
                  Login
                </Link>
              </li>
              <li>
                <a href="#como-funciona" className="text-gray-400 hover:text-seidmann-gold transition-colors">
                  Como Funciona
                </a>
              </li>
              <li>
                <a href="#planos" className="text-gray-400 hover:text-seidmann-gold transition-colors">
                  Planos
                </a>
              </li>
            </ul>
          </div>

          {/* Informações */}
          <div>
            <h3 className="font-display font-bold text-lg mb-4">Informações</h3>
            <ul className="space-y-2">
              <li>
                <a href="#faq" className="text-gray-400 hover:text-seidmann-gold transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-seidmann-gold transition-colors">
                  Política de Privacidade
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-seidmann-gold transition-colors">
                  Termos de Uso
                </a>
              </li>
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="font-display font-bold text-lg mb-4">Contato</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-seidmann-orange" />
                <a
                  href="https://wa.me/5511999999999"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-seidmann-gold transition-colors"
                >
                  WhatsApp
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-seidmann-orange" />
                <a
                  href="mailto:contato@seidmann.com"
                  className="text-gray-400 hover:text-seidmann-gold transition-colors"
                >
                  contato@seidmann.com
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Instagram className="w-5 h-5 text-seidmann-orange" />
                <a
                  href="https://instagram.com/seidmann"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-seidmann-gold transition-colors"
                >
                  @seidmann
                </a>
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
