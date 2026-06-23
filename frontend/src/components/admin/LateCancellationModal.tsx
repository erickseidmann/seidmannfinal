'use client'

import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { AlertTriangle, X } from 'lucide-react'

export type LateCancelChoice = 'back' | 'confirm' | 'exception'

export type LateCancellationModalVariant = 'cancel' | 'reschedule'

interface LateCancellationModalProps {
  isOpen: boolean
  horasAntecedencia: number
  variant?: LateCancellationModalVariant
  onClose: () => void
  onConfirm: () => void
  onException: () => void
}

export default function LateCancellationModal({
  isOpen,
  horasAntecedencia,
  variant = 'cancel',
  onClose,
  onConfirm,
  onException,
}: LateCancellationModalProps) {
  if (!isOpen) return null

  const isReschedule = variant === 'reschedule'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2 sm:p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 pr-2">
              {isReschedule ? 'Reagendar como exceção' : 'Cancelamento com pouca antecedência'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-950 space-y-2">
              {isReschedule ? (
                <>
                  <p>
                    Esta aula foi cancelada <strong>sem reposição</strong> por ter sido cancelada com pouca
                    antecedência (menos de {horasAntecedencia} horas).
                  </p>
                  <p>
                    Para reagendar, é necessário registrar uma <strong>exceção</strong> à regra de cancelamento
                    tardio.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Você está cancelando esta aula com <strong>menos de {horasAntecedencia} horas</strong> de
                    antecedência.
                  </p>
                  <p>Ao confirmar o cancelamento:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>O <strong>professor receberá</strong> por esta aula (registro automático).</li>
                    <li>
                      O <strong>aluno receberá e-mail</strong> de aula cancelada <strong>sem reposição</strong>.
                    </li>
                  </ul>
                </>
              )}
            </div>
          </div>

          {!isReschedule && (
            <p className="text-sm text-gray-600 mb-4">
              Se esta situação for uma <strong>exceção</strong> à regra, você poderá agendar reposição.
            </p>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button
              variant="outline"
              onClick={onException}
              className="!border-brand-orange !text-brand-orange hover:!bg-orange-50"
            >
              É uma exceção
            </Button>
            {!isReschedule && (
              <Button
                variant="primary"
                onClick={onConfirm}
                className="!bg-red-600 hover:!bg-red-700 !from-red-600 !to-red-600"
              >
                Confirmar cancelamento
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
