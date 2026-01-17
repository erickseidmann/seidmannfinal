/**
 * utils.ts
 * 
 * Utilitários gerais, incluindo função cn para classes CSS.
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
