/**
 * Header.tsx
 * 
 * Header fixo com logo, menu e CTAs.
 */

'use client'

import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import Logo from '@/components/branding/Logo'
import Button from '../ui/Button'

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    { name: 'Início', href: '#inicio' },
    { name: 'Como funciona', href: '#como-funciona' },
    { name: 'Planos', href: '#planos' },
    { name: 'Professores', href: '#professores' },
    { name: 'FAQ', href: '#faq' },
  ]

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      setIsMobileMenuOpen(false)
    }
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white shadow-md' : 'bg-white/95 backdrop-blur-sm'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          <Logo variant="icon" size="md" useFallback={true} />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <button
                key={link.name}
                onClick={() => scrollToSection(link.href)}
                className="text-sm font-medium text-gray-700 hover:text-brand-orange transition-colors"
              >
                {link.name}
              </button>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-4">
            <Button href="/login" variant="outline" size="sm">
              Login
            </Button>
            <Button href="/matricula" size="sm">
              Matricule-se
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-gray-700"
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
          <div className="container mx-auto px-4 py-4 space-y-4">
            {navLinks.map((link) => (
              <button
                key={link.name}
                onClick={() => scrollToSection(link.href)}
                className="block w-full text-left text-gray-700 hover:text-brand-orange font-medium py-2"
              >
                {link.name}
              </button>
            ))}
            <div className="pt-4 border-t space-y-2">
              <Button href="/login" variant="outline" size="sm" className="w-full">
                Login
              </Button>
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
