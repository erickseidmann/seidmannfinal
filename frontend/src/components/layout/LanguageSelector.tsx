'use client'

import { useState, useRef, useEffect } from 'react'
import { Globe } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Locale } from '@/lib/messages'

const LANGUAGES: { code: Locale; label: string }[] = [
  { code: 'pt-BR', label: 'PT' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
]

export function LanguageSelector() {
  const { locale, setLocale } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (code: Locale) => {
    setLocale(code)
    setIsOpen(false)
  }

  const currentLabel = LANGUAGES.find((l) => l.code === locale)?.label ?? 'PT'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        aria-label="Selecionar idioma"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe className="w-4 h-4" />
        <span>{currentLabel}</span>
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 py-1 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[80px] z-50"
        >
          {LANGUAGES.map((lang) => (
            <li key={lang.code} role="option">
              <button
                type="button"
                onClick={() => handleSelect(lang.code)}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                  locale === lang.code ? 'bg-brand-orange/10 text-brand-orange font-semibold' : 'text-gray-700'
                }`}
              >
                {lang.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
