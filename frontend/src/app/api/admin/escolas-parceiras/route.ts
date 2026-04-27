import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isSuperAdminEmail } from '@/lib/auth'

const PARTNER_SCHOOL_PREFIX = 'escola-parceira:'

const querySchema = z.object({
  school: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  format: z.enum(['json', 'csv']).optional(),
})

function parseDateStart(value?: string): Date | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00.000`)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function parseDateEnd(value?: string): Date | null {
  if (!value) return null
  const d = new Date(`${value}T23:59:59.999`)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function schoolLabel(code: string, otherName: string | null): string {
  if (code === 'SEIDMANN') return 'SEIDMANN'
  if (code === 'YOUBECOME') return 'YOUBECOME'
  if (code === 'HIGHWAY') return 'HIGHWAY'
  if (code === 'OUTRO' && otherName && otherName.trim()) return otherName.trim()
  if (code === 'OUTRO') return 'OUTRO'
  return code
}

function schoolValueToCondition(value: string) {
  if (value.startsWith('OUTRO::')) {
    return {
      escolaMatricula: 'OUTRO' as const,
      escolaMatriculaOutro: value.replace('OUTRO::', ''),
    }
  }
  return { escolaMatricula: value }
}

function escapeCsvCell(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      school: searchParams.get('school') ?? undefined,
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      format: searchParams.get('format') ?? 'json',
    })
    const responseFormat = parsed.data.format ?? 'json'
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: 'Parâmetros inválidos' }, { status: 400 })
    }

    const startDate = parseDateStart(parsed.data.startDate)
    const endDate = parseDateEnd(parsed.data.endDate)
    if (parsed.data.startDate && !startDate) {
      return NextResponse.json({ ok: false, message: 'Data inicial inválida' }, { status: 400 })
    }
    if (parsed.data.endDate && !endDate) {
      return NextResponse.json({ ok: false, message: 'Data final inválida' }, { status: 400 })
    }
    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json(
        { ok: false, message: 'Data inicial deve ser menor ou igual à data final' },
        { status: 400 }
      )
    }

    const schoolRaw = (parsed.data.school ?? '').trim()

    const isSuperAdmin = isSuperAdminEmail(auth.session?.email)
    const sessionPages = Array.isArray(auth.session?.adminPages) ? auth.session.adminPages : []
    const allowedSchoolValues = sessionPages
      .filter((key) => key.startsWith(PARTNER_SCHOOL_PREFIX))
      .map((key) => key.replace(PARTNER_SCHOOL_PREFIX, ''))
      .filter(Boolean)

    const schoolRows = await prisma.enrollment.findMany({
      where: {
        escolaMatricula: { not: null },
      },
      select: {
        escolaMatricula: true,
        escolaMatriculaOutro: true,
      },
      distinct: ['escolaMatricula', 'escolaMatriculaOutro'],
      orderBy: [{ escolaMatricula: 'asc' }, { escolaMatriculaOutro: 'asc' }],
    })

    const allSchoolOptions = schoolRows
      .map((row) => {
        const code = row.escolaMatricula ?? ''
        const otherName = row.escolaMatriculaOutro ?? null
        if (!code) return null
        const value = code === 'OUTRO' && otherName ? `OUTRO::${otherName}` : code
        return { value, label: schoolLabel(code, otherName) }
      })
      .filter((item): item is { value: string; label: string } => Boolean(item))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

    const schoolOptions = isSuperAdmin
      ? allSchoolOptions
      : allSchoolOptions.filter((opt) => allowedSchoolValues.includes(opt.value))

    if (!isSuperAdmin && schoolOptions.length === 0) {
      const emptyData = {
        schoolOptions: [],
        selectedSchool: null,
        period: {
          startDate: parsed.data.startDate ?? null,
          endDate: parsed.data.endDate ?? null,
        },
        totals: {
          totalMatriculados: 0,
          totalAtivos: 0,
        },
        enrollments: [],
      }

      if (responseFormat === 'csv') {
        const csv = 'Nome;Data matrícula;Valor;Status'
        return new NextResponse('\uFEFF' + csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="escolas-parceiras.csv"',
          },
        })
      }

      return NextResponse.json({
        ok: true,
        data: emptyData,
      })
    }

    if (!isSuperAdmin && schoolRaw && !schoolOptions.some((opt) => opt.value === schoolRaw)) {
      return NextResponse.json({ ok: false, message: 'Você não tem acesso a esta escola.' }, { status: 403 })
    }

    const whereSchool =
      schoolRaw.length === 0
        ? !isSuperAdmin
          ? {
              OR: schoolOptions.map((opt) => schoolValueToCondition(opt.value)),
            }
          : undefined
        : schoolValueToCondition(schoolRaw)

    const whereDate =
      startDate || endDate
        ? {
            criadoEm: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : undefined

    const enrollments = await prisma.enrollment.findMany({
      where: {
        ...(whereSchool ?? {}),
        ...(whereDate ?? {}),
      },
      select: {
        id: true,
        nome: true,
        criadoEm: true,
        status: true,
        valorMensalidade: true,
        paymentInfo: {
          select: {
            valorMensal: true,
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    })

    const rows = enrollments.map((e) => {
      const valor =
        e.valorMensalidade != null
          ? Number(e.valorMensalidade)
          : e.paymentInfo?.valorMensal != null
            ? Number(e.paymentInfo.valorMensal)
            : 0
      return {
        id: e.id,
        nome: e.nome,
        dataMatricula: e.criadoEm.toISOString(),
        valorMensalidade: Math.round(valor * 100) / 100,
        status: e.status,
      }
    })

    const totals = {
      totalMatriculados: rows.length,
      totalAtivos: rows.filter((r) => r.status === 'ACTIVE').length,
    }

    if (responseFormat === 'csv') {
      const csvRows = [
        'Nome;Data matrícula;Valor;Status',
        ...rows.map((row) => {
          const date = new Date(row.dataMatricula)
          const formattedDate = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR')
          const value = (Math.round((row.valorMensalidade ?? 0) * 100) / 100).toFixed(2).replace('.', ',')
          return [
            escapeCsvCell(row.nome),
            escapeCsvCell(formattedDate),
            escapeCsvCell(value),
            escapeCsvCell(row.status),
          ].join(';')
        }),
      ].join('\r\n')

      return new NextResponse('\uFEFF' + csvRows, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="escolas-parceiras.csv"',
        },
      })
    }

    return NextResponse.json({
      ok: true,
      data: {
        schoolOptions,
        selectedSchool: schoolRaw || null,
        period: {
          startDate: parsed.data.startDate ?? null,
          endDate: parsed.data.endDate ?? null,
        },
        totals,
        enrollments: rows,
      },
    })
  } catch (error) {
    console.error('[api/admin/escolas-parceiras GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados de escolas parceiras' },
      { status: 500 }
    )
  }
}

