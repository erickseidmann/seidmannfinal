'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { Locale } from '@/lib/messages'
import { getMessage } from '@/lib/messages'

const STORAGE_KEY = 'seidmann-lang'

const LOCALES: Locale[] = ['pt-BR', 'en', 'es']

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'pt-BR'
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
  return LOCALES.includes(stored ?? '') ? (stored as Locale) : 'pt-BR'
}

function setStoredLocale(locale: Locale) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale
}

interface LanguageContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('pt-BR')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setLocaleState(getStoredLocale())
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      setStoredLocale(locale)
    }
  }, [locale, mounted])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    setStoredLocale(newLocale)
  }, [])

  const t = useCallback(
    (key: string) => getMessage(locale, key),
    [locale]
  )

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return ctx
}

export function useTranslation() {
  const { t } = useLanguage()
  return { t }
}
