/**
 * Componente StatCard
 * 
 * Card para exibir estatísticas no dashboard
 */

import { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'

interface StatCardProps {
  title: string
  value: string | number
  icon?: ReactNode
  color?: 'green' | 'orange' | 'red' | 'blue' | 'purple'
  subtitle?: string
}

const colorClasses = {
  green: 'text-green-600 bg-green-100',
  orange: 'text-orange-600 bg-orange-100',
  red: 'text-red-600 bg-red-100',
  blue: 'text-blue-600 bg-blue-100',
  purple: 'text-purple-600 bg-purple-100',
}

export default function StatCard({ title, value, icon, color = 'blue', subtitle }: StatCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className={`text-3xl font-bold ${colorClasses[color]}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={`p-3 rounded-full ${colorClasses[color]}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}
