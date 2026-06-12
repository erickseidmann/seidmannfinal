/**
 * GET /api/admin/certificates — lista certificados ativos
 * POST /api/admin/certificates — gera certificado online
 */

import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { allocateCertificateNumber } from '@/lib/certificate-number'
import { generateCertificatePdfBuffer } from '@/lib/certificate-pdf'
import { serializeCertificate } from '@/lib/certificate-serialize'
import {
  defaultCourseBody,
  formatCertificateDateShort,
  isValidCpf,
  normalizeCpf,
} from '@/lib/certificate-format'
import type { OnlineCertificateTypeValue } from '@/lib/certificate-constants'

function parseDateInput(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T12:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const rows = await prisma.onlineCertificate.findMany({
      where: { active: true },
      orderBy: { criadoEm: 'desc' },
    })

    return NextResponse.json({
      ok: true,
      data: rows.map(serializeCertificate),
    })
  } catch (error) {
    console.error('[api/admin/certificates GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao listar certificados' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json()
    const type = body.type as OnlineCertificateTypeValue
    const studentName = typeof body.studentName === 'string' ? body.studentName.trim() : ''
    const studentCpfRaw = typeof body.studentCpf === 'string' ? body.studentCpf : ''
    const courseTitle = typeof body.courseTitle === 'string' ? body.courseTitle.trim() : ''
    let courseBody = typeof body.courseBody === 'string' ? body.courseBody.trim() : ''
    const totalHours = parseInt(String(body.totalHours ?? ''), 10)
    const periodStart = parseDateInput(body.periodStart)
    const periodEnd = parseDateInput(body.periodEnd)
    const issueDate = parseDateInput(body.issueDate) ?? new Date()

    if (type !== 'DECLARACAO' && type !== 'CONCLUSAO') {
      return NextResponse.json({ ok: false, message: 'Tipo de certificado inválido' }, { status: 400 })
    }
    if (!studentName) {
      return NextResponse.json({ ok: false, message: 'Informe o nome do aluno' }, { status: 400 })
    }
    const studentCpf = normalizeCpf(studentCpfRaw)
    if (!isValidCpf(studentCpf)) {
      return NextResponse.json({ ok: false, message: 'CPF inválido' }, { status: 400 })
    }
    if (!courseTitle) {
      return NextResponse.json({ ok: false, message: 'Informe o título/curso do certificado' }, { status: 400 })
    }
    if (!Number.isFinite(totalHours) || totalHours <= 0) {
      return NextResponse.json({ ok: false, message: 'Informe a quantidade de horas' }, { status: 400 })
    }
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ ok: false, message: 'Informe o período de estudos' }, { status: 400 })
    }
    if (periodEnd < periodStart) {
      return NextResponse.json({ ok: false, message: 'Data final deve ser posterior à inicial' }, { status: 400 })
    }

    const periodStartStr = formatCertificateDateShort(periodStart)
    const periodEndStr = formatCertificateDateShort(periodEnd)

    if (!courseBody) {
      courseBody = defaultCourseBody(type, {
        periodStart: periodStartStr,
        periodEnd: periodEndStr,
        totalHours,
        courseTitle,
      })
    }

    const certificateNo = await allocateCertificateNumber(issueDate)

    const pdfBuffer = await generateCertificatePdfBuffer({
      certificateNo,
      type,
      studentName,
      studentCpf,
      courseTitle,
      courseBody,
      totalHours,
      issueDate,
    })

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'certificates')
    await mkdir(uploadsDir, { recursive: true })
    const pdfFileName = `${certificateNo.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`
    const pdfFullPath = path.join(uploadsDir, pdfFileName)
    await writeFile(pdfFullPath, pdfBuffer)
    const pdfPath = `/uploads/certificates/${pdfFileName}`

    const row = await prisma.onlineCertificate.create({
      data: {
        certificateNo,
        type,
        studentName,
        studentCpf,
        courseTitle,
        courseBody,
        periodStart,
        periodEnd,
        totalHours,
        issueDate,
        pdfPath,
        createdById: auth.session.userId,
      },
    })

    return NextResponse.json({
      ok: true,
      data: serializeCertificate(row),
    })
  } catch (error) {
    console.error('[api/admin/certificates POST]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao gerar certificado' }, { status: 500 })
  }
}
