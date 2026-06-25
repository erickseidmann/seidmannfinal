'use client'

import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'

export type AnnouncementViewData = {
  title: string
  message: string
  criadoEm?: string
  sentAt?: string | null
}

interface AnnouncementViewModalProps {
  isOpen: boolean
  announcement: AnnouncementViewData | null
  onClose: () => void
  dateLocale?: string
}

export default function AnnouncementViewModal({
  isOpen,
  announcement,
  onClose,
  dateLocale = 'pt-BR',
}: AnnouncementViewModalProps) {
  if (!announcement) return null

  const dateIso = announcement.sentAt ?? announcement.criadoEm
  const dateLabel = dateIso
    ? new Intl.DateTimeFormat(dateLocale, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(dateIso))
    : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={announcement.title}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {dateLabel && <p className="text-xs text-gray-500 mb-3">{dateLabel}</p>}
      <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
        {announcement.message}
      </div>
    </Modal>
  )
}
