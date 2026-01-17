/**
 * API Route: POST /api/enrollments
 * 
 * Cria um novo Enrollment (lead)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidEmail, normalizePhone, requireMinDigits } from '@/lib/validators'
import { createUniqueEnrollmentCode } from '@/lib/enrollmentCode'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fullName, email, whatsapp, language, level, goal, availability } = body

    // Validações
    const errors: string[] = []

    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      errors.push('Nome completo é obrigatório')
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      errors.push('Email é obrigatório')
    } else if (!isValidEmail(email)) {
      errors.push('Email inválido')
    }

    if (!whatsapp || typeof whatsapp !== 'string' || !whatsapp.trim()) {
      errors.push('WhatsApp é obrigatório')
    } else {
      const normalized = normalizePhone(whatsapp)
      if (!requireMinDigits(whatsapp, 10)) {
        errors.push('WhatsApp deve ter no mínimo 10 dígitos')
      }
    }

    if (!language || typeof language !== 'string') {
      errors.push('Idioma é obrigatório')
    } else if (language !== 'ENGLISH' && language !== 'SPANISH') {
      errors.push('Idioma deve ser ENGLISH ou SPANISH')
    }

    if (!level || typeof level !== 'string' || !level.trim()) {
      errors.push('Nível é obrigatório')
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: errors },
        { status: 400 }
      )
    }

    // Gerar código único
    const code = await createUniqueEnrollmentCode()

    // Normalizar whatsapp
    const normalizedWhatsapp = normalizePhone(whatsapp)

    // Criar enrollment
    const enrollment = await prisma.enrollment.create({
      data: {
        code,
        status: 'LEAD',
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        whatsapp: normalizedWhatsapp,
        language: language as 'ENGLISH' | 'SPANISH',
        level: level.trim(),
        goal: goal?.trim() || null,
        availability: availability?.trim() || null,
      },
    })

    // Retornar resposta (sem dados sensíveis)
    return NextResponse.json(
      {
        id: enrollment.id,
        code: enrollment.code,
        fullName: enrollment.fullName,
        email: enrollment.email,
        whatsapp: enrollment.whatsapp,
        language: enrollment.language,
        level: enrollment.level,
        goal: enrollment.goal,
        availability: enrollment.availability,
        createdAt: enrollment.createdAt,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Erro ao criar enrollment:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
