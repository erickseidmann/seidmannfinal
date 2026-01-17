/**
 * Header.tsx
 * 
 * Header global da aplicação.
 * Usado em todas as páginas com navegação e CTAs.
 */

'use client'

import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import Logo from '@/components/branding/Logo'
import Button from '../ui/Button'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface HeaderProps {
  variant?: 'default' | 'transparent'
}

export function Header({ variant = 'default' }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const isTransparent = variant === 'transparent' && !isScrolled
  const isLanding = pathname === '/'

  const navLinks = isLanding ? [
    { name: 'Início', href: '#inicio' },
    { name: 'Como funciona', href: '#como-funciona' },
    { name: 'Planos', href: '#planos' },
    { name: 'Professores', href: '#professores' },
    { name: 'FAQ', href: '#faq' },
  ] : []

  const scrollToSection = (href: string) => {
    if (href.startsWith('#')) {
      const element = document.querySelector(href)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
        setIsMobileMenuOpen(false)
      }
    }
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isTransparent
          ? 'bg-white/90 backdrop-blur-md shadow-sm'
          : isScrolled
          ? 'bg-white shadow-md'
          : 'bg-white/95 backdrop-blur-sm'
      }`}
    >
      <div className="container-content">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center gap-3 group">
            <Logo variant="icon" size="md" useFallback={true} noLink={true} className="group-hover:opacity-90 transition-opacity" />
            <div className="hidden sm:block">
              <span className="font-display font-bold text-gray-800 text-lg leading-tight">
                Seidmann{' '}
                <span className="font-medium">Institute</span>
              </span>
            </div>
            <div className="sm:hidden">
              <span className="font-display font-bold text-gray-800 text-base leading-tight">
                Seidmann
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          {isLanding && navLinks.length > 0 && (
            <nav className="hidden md:flex items-center space-x-8">
              {navLinks.map((link) => (
                <button
                  key={link.name}
                  onClick={() => scrollToSection(link.href)}
                  className="text-sm font-medium text-gray-800 hover:text-brand-orange transition-colors duration-200"
                >
                  {link.name}
                </button>
              ))}
            </nav>
          )}

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/login"
              className={`text-sm font-medium transition-colors duration-200 ${
                isTransparent
                  ? 'text-gray-900 hover:text-brand-orange'
                  : 'text-gray-800 hover:text-brand-orange'
              }`}
            >
              Login
            </Link>
            <Button href="/matricula" size="sm">
              Matricule-se
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-gray-800 transition-colors duration-200"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t bg-white">
          <div className="container-content py-4 space-y-4">
            {isLanding && navLinks.map((link) => (
              <button
                key={link.name}
                onClick={() => scrollToSection(link.href)}
                className="block w-full text-left text-brand-text hover:text-brand-orange font-medium py-2 transition-colors duration-200"
              >
                {link.name}
              </button>
            ))}
            <div className="pt-4 border-t space-y-2">
              <Link
                href="/login"
                className="block w-full text-left text-brand-text hover:text-brand-orange font-medium py-2 transition-colors duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Login
              </Link>
              <Button href="/matricula" size="sm" className="w-full">
                Matricule-se
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
