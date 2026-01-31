/**
 * Componente Table
 *
 * Tabela reutilizável para listagens admin (com suporte a ordenação opcional)
 */

import { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  render?: (item: T) => ReactNode
  sortable?: boolean
  sortValue?: (item: T) => string | number
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (item: T) => void
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
}

export default function Table<T extends { id: string }>({
  columns,
  data,
  loading = false,
  emptyMessage = 'Nenhum item encontrado',
  onRowClick,
  sortKey,
  sortDir,
  onSort,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="text-center py-12 text-gray-600">Carregando...</div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">{emptyMessage}</div>
    )
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => {
              const isSorted = sortKey === column.key
              const canSort = column.sortable && onSort
              return (
                <th
                  key={column.key}
                  className={`text-left py-3 px-4 text-sm font-semibold text-gray-700 ${canSort ? 'cursor-pointer select-none hover:bg-gray-100' : ''}`}
                  onClick={() => canSort && onSort(column.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.label}
                    {canSort && (
                      <span className="text-gray-400">
                        {isSorted && sortDir === 'asc' && <ChevronUp className="w-4 h-4" />}
                        {isSorted && sortDir === 'desc' && <ChevronDown className="w-4 h-4" />}
                        {!isSorted && <ChevronDown className="w-4 h-4 opacity-40" />}
                      </span>
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={item.id}
              onClick={() => onRowClick?.(item)}
              className={`border-b border-gray-100 hover:bg-gray-50 ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
            >
              {columns.map((column) => (
                <td key={column.key} className="py-3 px-4 text-sm text-gray-900">
                  {column.render ? column.render(item) : (item as any)[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
