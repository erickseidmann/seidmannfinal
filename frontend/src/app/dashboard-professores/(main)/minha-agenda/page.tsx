'use client'

import { useTranslation } from '@/contexts/LanguageContext'

export default function MinhaAgendaPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('professor.nav.myAgenda')}</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Ainda estamos trabalhando nesta funcionalidade. Em breve estará disponível para você controlar sua agenda.
        </p>
      </div>
    </div>
  )
}
