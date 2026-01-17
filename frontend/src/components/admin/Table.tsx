/**
 * Componente Table
 * 
 * Tabela reutilizável para listagens admin
 */

import { ReactNode } from 'react'

interface Column<T> {
  key: string
  label: string
  render?: (item: T) => ReactNode
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (item: T) => void
}

export default function Table<T extends { id: string }>({
  columns,
  data,
  loading = false,
  emptyMessage = 'Nenhum item encontrado',
  onRowClick,
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
            {columns.map((column) => (
              <th
                key={column.key}
                className="text-left py-3 px-4 text-sm font-semibold text-gray-700"
              >
                {column.label}
              </th>
            ))}
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
