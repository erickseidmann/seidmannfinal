'use client'

import { ReactNode, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type TableScrollAreaProps = {
  children: ReactNode
  className?: string
  scrollClassName?: string
  scrollStyle?: React.CSSProperties
}

/**
 * Tabela com scroll horizontal: barra nativa + arrastar com o mouse.
 */
export default function TableScrollArea({
  children,
  className,
  scrollClassName = 'overflow-x-auto',
  scrollStyle,
}: TableScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false })

  const stopDrag = useCallback(() => {
    dragRef.current.active = false
    const el = scrollRef.current
    if (el) el.style.removeProperty('user-select')
  }, [])

  useEffect(() => {
    const onWindowMouseUp = () => stopDrag()
    window.addEventListener('mouseup', onWindowMouseUp)
    return () => window.removeEventListener('mouseup', onWindowMouseUp)
  }, [stopDrag])

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    dragRef.current = {
      active: true,
      startX: e.pageX,
      scrollLeft: el.scrollLeft,
      moved: false,
    }
  }

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const el = scrollRef.current
    if (!el) return
    const dx = e.pageX - dragRef.current.startX
    if (Math.abs(dx) > 3) {
      dragRef.current.moved = true
      el.style.userSelect = 'none'
    }
    el.scrollLeft = dragRef.current.scrollLeft - dx
  }

  const onClickCapture = (e: React.MouseEvent) => {
    if (dragRef.current.moved) {
      e.preventDefault()
      e.stopPropagation()
      dragRef.current.moved = false
    }
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onClickCapture={onClickCapture}
        style={scrollStyle}
        className={cn(
          'scrollbar-table overscroll-x-contain cursor-grab active:cursor-grabbing',
          scrollClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}
