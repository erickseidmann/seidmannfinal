/**
 * Componente Table
 *
 * Tabela reutilizável para listagens admin (ordenação opcional, colunas fixas e seletor de colunas)
 */

'use client'

import { ReactNode, useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, Columns } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  render?: (item: T) => ReactNode
  sortable?: boolean
  sortValue?: (item: T) => string | number
  /** Se true, coluna sempre visível e não aparece no seletor de colunas */
  fixed?: boolean
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
  /** Chaves das colunas visíveis (inclui fixas). Se omitido, todas são visíveis. */
  visibleColumnKeys?: string[]
  /** Callback ao alterar colunas visíveis (permite mostrar botão "Colunas"). */
  onVisibleColumnsChange?: (keys: string[]) => void
  /** Classe CSS adicional por linha (ex: destaque por nota). */
  getRowClassName?: (item: T) => string
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
  visibleColumnKeys,
  onVisibleColumnsChange,
  getRowClassName,
}: TableProps<T>) {
  const [columnsOpen, setColumnsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fixedKeys = columns.filter((c) => c.fixed).map((c) => c.key)
  const toggleableColumns = columns.filter((c) => !c.fixed)
  const hasColumnSelector = toggleableColumns.length > 0 && onVisibleColumnsChange != null

  const effectiveVisible =
    visibleColumnKeys ?? columns.map((c) => c.key)
  const visibleSet = new Set(effectiveVisible)
  const displayColumns = columns.filter((c) => c.fixed || visibleSet.has(c.key))

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setColumnsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleColumn = (key: string) => {
    if (!onVisibleColumnsChange) return
    const fixedSet = new Set(fixedKeys)
    let next = visibleSet.has(key)
      ? effectiveVisible.filter((k) => k !== key)
      : [...effectiveVisible, key]
    next = [...fixedKeys, ...next.filter((k) => !fixedSet.has(k))]
    onVisibleColumnsChange(next)
  }

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
    <div className="w-full max-w-full">
      {hasColumnSelector && (
        <div className="mb-3 flex justify-end">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setColumnsOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Columns className="w-4 h-4" />
              Colunas
            </button>
            {columnsOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">Exibir colunas</p>
                {toggleableColumns.map((col) => (
                  <label
                    key={col.key}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={visibleSet.has(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-800">{col.label || col.key}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {displayColumns.map((column) => {
                const isSorted = sortKey === column.key
                const canSort = column.sortable && onSort
                return (
                  <th
                    key={column.key}
                    className={`whitespace-nowrap text-left py-3 px-3 text-sm font-semibold text-gray-700 ${canSort ? 'cursor-pointer select-none hover:bg-gray-100' : ''}`}
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
                className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
                  onRowClick ? 'cursor-pointer' : ''
                } ${getRowClassName ? getRowClassName(item) : ''}`}
              >
                {displayColumns.map((column) => (
                  <td key={column.key} className="py-3 px-3 text-sm text-gray-900 whitespace-nowrap">
                    {column.render ? column.render(item) : (item as any)[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
