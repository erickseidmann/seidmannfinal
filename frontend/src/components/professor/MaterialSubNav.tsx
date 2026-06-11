'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/contexts/LanguageContext'

export default function MaterialSubNav() {
  const pathname = usePathname()
  const { t } = useTranslation()

  const tabs = [
    { href: '/dashboard-professores/material', labelKey: 'professor.material.books' },
    { href: '/dashboard-professores/treinamentos', labelKey: 'professor.material.trainings' },
  ] as const

  return (
    <nav className="flex gap-2 border-b border-gray-200 mb-6">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}
