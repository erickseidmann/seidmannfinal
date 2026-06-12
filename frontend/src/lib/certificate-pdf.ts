import QRCode from 'qrcode'
import {
  CERTIFICATE_INSTITUTE,
  getCertificateValidationUrl,
  type OnlineCertificateTypeValue,
} from '@/lib/certificate-constants'
import { formatCertificateDateLong, formatCpfDisplay } from '@/lib/certificate-format'

export interface CertificatePdfInput {
  certificateNo: string
  type: OnlineCertificateTypeValue
  studentName: string
  studentCpf: string
  courseTitle: string
  courseBody: string
  totalHours: number
  issueDate: Date
}

const MARGIN = 20
const PAGE_W = 210
const CONTENT_W = PAGE_W - MARGIN * 2

function splitParagraphs(doc: import('jspdf').jsPDF, text: string, y: number, lineHeight = 6): number {
  const lines = doc.splitTextToSize(text, CONTENT_W)
  doc.text(lines, MARGIN, y)
  return y + lines.length * lineHeight
}

function drawInstituteFooter(doc: import('jspdf').jsPDF, issueDate: Date, startY: number): number {
  const inst = CERTIFICATE_INSTITUTE
  let y = startY
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(40, 40, 40)

  const dateLine = `${inst.city}, ${formatCertificateDateLong(issueDate)}.`
  doc.text(dateLine, MARGIN, y)
  y += 6
  doc.text(inst.name, MARGIN, y)
  y += 5
  doc.text(`CNPJ ${inst.cnpj}`, MARGIN, y)
  y += 5
  doc.text(inst.addressLine1, MARGIN, y)
  y += 5
  doc.text(inst.addressLine2, MARGIN, y)
  y += 5
  doc.text(inst.addressLine3, MARGIN, y)
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.text(inst.directorName, MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text(inst.directorTitle, MARGIN, y)
  return y + 8
}

async function drawValidationBlock(
  doc: import('jspdf').jsPDF,
  certificateNo: string,
  y: number
): Promise<number> {
  const validationUrl = getCertificateValidationUrl(certificateNo)
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  doc.setFont('helvetica', 'bold')
  doc.text(`Certificado nº ${certificateNo}`, MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text('Valide este documento:', MARGIN, y)
  y += 4
  doc.setTextColor(0, 80, 160)
  const urlLines = doc.splitTextToSize(validationUrl, CONTENT_W - 32)
  doc.text(urlLines, MARGIN, y)
  y += urlLines.length * 4 + 4

  const qrDataUrl = await QRCode.toDataURL(validationUrl, { width: 256, margin: 1 })
  doc.addImage(qrDataUrl, 'PNG', PAGE_W - MARGIN - 28, y - 28, 28, 28)
  return y + 4
}

export async function generateCertificatePdfBuffer(input: CertificatePdfInput): Promise<Buffer> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const cpfFormatted = formatCpfDisplay(input.studentCpf)
  const studentUpper = input.studentName.trim().toUpperCase()

  doc.setTextColor(30, 30, 30)

  if (input.type === 'DECLARACAO') {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    const title = 'DECLARAÇÃO DE VÍNCULO E PERÍODO DE ESTUDOS'
    doc.text(title, PAGE_W / 2, 28, { align: 'center', maxWidth: CONTENT_W })

    let y = 42
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    y = splitParagraphs(doc, 'Declaramos para os devidos fins que:', y)

    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(studentUpper, PAGE_W / 2, y, { align: 'center' })
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(`CPF: ${cpfFormatted}`, PAGE_W / 2, y, { align: 'center' })

    y += 12
    doc.setFontSize(10.5)
    y = splitParagraphs(doc, input.courseBody, y, 5.5)

    y += 10
    y = drawInstituteFooter(doc, input.issueDate, y)
    await drawValidationBlock(doc, input.certificateNo, Math.min(y, 250))
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.text('Certificado', PAGE_W / 2, 24, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(studentUpper, PAGE_W / 2, 36, { align: 'center', maxWidth: CONTENT_W })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.text('de Conclusão', PAGE_W / 2, 44, { align: 'center' })

    let y = 56
    doc.setFontSize(10.5)
    const bodyText = input.courseBody.includes('CPF')
      ? input.courseBody
      : `Portador do CPF: ${cpfFormatted}, ${input.courseBody}`
    y = splitParagraphs(doc, bodyText, y, 5.5)

    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    y = splitParagraphs(doc, `Atividade: ${input.courseTitle}`, y, 5.5)

    y += 10
    doc.setFontSize(11)
    doc.text('C E R T I F I C A - S E', PAGE_W / 2, y, { align: 'center' })
    y += 12

    y = drawInstituteFooter(doc, input.issueDate, y)
    await drawValidationBlock(doc, input.certificateNo, Math.min(y, 248))
  }

  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
