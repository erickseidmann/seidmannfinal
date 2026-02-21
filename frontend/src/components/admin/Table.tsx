/**
 * Componente Table
 *
 * Tabela reutilizável para listagens admin (ordenação opcional, colunas fixas e seletor de colunas)
 */

'use client'

import { ReactNode, useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; maxHeight: number; openUpward?: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fixedKeys = columns.filter((c) => c.fixed).map((c) => c.key)
  const toggleableColumns = columns.filter((c) => !c.fixed)
  const hasColumnSelector = toggleableColumns.length > 0 && onVisibleColumnsChange != null

  const effectiveVisible =
    visibleColumnKeys ?? columns.map((c) => c.key)
  const visibleSet = new Set(effectiveVisible)
  const displayColumns = columns.filter((c) => c.fixed || visibleSet.has(c.key))

  const updateDropdownPosition = useCallback(() => {
    if (!triggerRef.current || !columnsOpen) return
    const rect = triggerRef.current.getBoundingClientRect()
    const padding = 8
    const dropdownMinHeight = 120
    const spaceBelow = window.innerHeight - rect.bottom - padding
    const spaceAbove = rect.top - padding
    const maxH = Math.min(400, window.innerHeight * 0.6)
    const openUpward = spaceBelow < dropdownMinHeight && spaceAbove > spaceBelow
    let top: number
    if (openUpward) {
      top = Math.max(padding, rect.top - maxH - 4)
    } else {
      top = rect.bottom + 4
    }
    const left = Math.max(padding, Math.min(rect.right - 200, window.innerWidth - 220))
    setDropdownStyle({ top, left, maxHeight: maxH, openUpward })
  }, [columnsOpen])

  useEffect(() => {
    if (columnsOpen) {
      updateDropdownPosition()
      window.addEventListener('scroll', updateDropdownPosition, true)
      window.addEventListener('resize', updateDropdownPosition)
    } else {
      setDropdownStyle(null)
    }
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true)
      window.removeEventListener('resize', updateDropdownPosition)
    }
  }, [columnsOpen, updateDropdownPosition])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setColumnsOpen(false)
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

  const dropdownContent = hasColumnSelector && columnsOpen && dropdownStyle && typeof document !== 'undefined' && createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[100] min-w-[200px] w-[200px] rounded-lg border border-gray-200 bg-white py-2 shadow-xl overflow-hidden"
      style={{
        top: dropdownStyle.top,
        left: dropdownStyle.left,
        maxHeight: dropdownStyle.maxHeight,
      }}
    >
      <div className="overflow-y-auto h-full" style={{ maxHeight: dropdownStyle.maxHeight }}>
        <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase sticky top-0 bg-white">Exibir colunas</p>
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
    </div>,
    document.body
  )

  return (
    <div className="w-full max-w-full">
      {hasColumnSelector && (
        <div className="mb-3 flex flex-col sm:flex-row sm:justify-end gap-2">
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setColumnsOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 w-full sm:w-auto justify-center sm:justify-start"
            >
              <Columns className="w-4 h-4" />
              <span className="hidden sm:inline">Colunas</span>
              <span className="sm:hidden">Colunas visíveis</span>
            </button>
            {dropdownContent}
          </div>
        </div>
      )}
      <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="min-w-full inline-block">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {displayColumns.map((column) => {
                  const isSorted = sortKey === column.key
                  const canSort = column.sortable && onSort
                  return (
                    <th
                      key={column.key}
                      className={`whitespace-nowrap text-left py-2 sm:py-3 px-2 sm:px-3 text-xs sm:text-sm font-semibold text-gray-700 ${canSort ? 'cursor-pointer select-none hover:bg-gray-100' : ''}`}
                      onClick={() => canSort && onSort(column.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {column.label}
                        {canSort && (
                          <span className="text-gray-400">
                            {isSorted && sortDir === 'asc' && <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" />}
                            {isSorted && sortDir === 'desc' && <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />}
                            {!isSorted && <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 opacity-40" />}
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
                    <td key={column.key} className="py-2 sm:py-3 px-2 sm:px-3 text-xs sm:text-sm text-gray-900 whitespace-nowrap">
                      {column.render ? column.render(item) : (item as any)[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
