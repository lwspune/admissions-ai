// Render a paper test's answer sheet to PDF from the shared layout.
//
// This module owns INK ONLY. Every coordinate comes from `layout.ts`, which
// the scanner will also read — if the renderer nudged a bubble "to look
// right", the reader would sample the wrong spot and misread a real answer.
// Draw what the layout says or change the layout.
//
// jsPDF is dynamic-imported: only someone who downloads a sheet pays for it.

import type { AnswerSheet } from '../paperSheet'
import { FONTS, LAYOUT_VERSION, buildAnswerSheetLayout, paperNoDigits, textWidthMm, type AnswerSheetLayout } from './layout'

type Doc = InstanceType<typeof import('jspdf').jsPDF>

const LINE_W = 0.25
const MIDDLE = { baseline: 'middle' } as const

const INSTRUCTIONS = [
  'Use a black or blue ball pen. Fill one bubble completely for each answer. To skip a question, leave it blank.',
  'Numeric answers: write the number in the boxes with its last whole digit just left of the point, then fill the bubble under each digit you wrote.',
  'Do not write on the paper code.',
]

function issueDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

function drawHeader(doc: Doc, l: AnswerSheetLayout, s: AnswerSheet) {
  const { header } = l
  doc.setLineWidth(LINE_W)
  doc.rect(header.box.x, header.box.y, header.box.width, header.box.height, 'S')

  const lines: [string, string][] = [
    ['Aptitude Test', 'Answer sheet'],
    ['Name', s.name],
    ['Class', `Admission to Class ${s.classLevel}`],
    ['Date', issueDate(s.issuedAt)],
    ['Paper No', String(s.paperNo)],
  ]
  lines.forEach(([label, value], i) => {
    const at = header.lines[i]!
    doc.setFontSize(i === 0 ? FONTS.header + 2 : FONTS.small)
    doc.setFont('helvetica', 'bold')
    doc.text(i === 0 ? label : `${label}:`, at.x, at.y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(i === 0 ? FONTS.header + 2 : FONTS.header)
    doc.text(value, at.x + (i === 0 ? 30 : 16), at.y)
  })

  const stamp = `OMR ${LAYOUT_VERSION} · ${s.formats.length}Q · Paper ${s.paperNo}`
  doc.setFontSize(FONTS.stamp)
  doc.text(stamp, header.stampEnd.x - textWidthMm(stamp, FONTS.stamp), header.stampEnd.y)
}

function drawInstructions(doc: Doc, l: AnswerSheetLayout) {
  const box = l.instructions
  doc.setFontSize(FONTS.small)
  let y = box.y + 6
  for (const para of INSTRUCTIONS) {
    const wrapped = doc.splitTextToSize(para, box.width) as string[]
    doc.text(wrapped, box.x, y)
    y += wrapped.length * 2.8 + 1.5
  }
}

function drawRegistration(doc: Doc, l: AnswerSheetLayout) {
  doc.setFillColor(0, 0, 0)
  for (const s of l.registration) doc.rect(s.x, s.y, s.size, s.size, 'F')
}

function drawCode(doc: Doc, l: AnswerSheetLayout, paperNo: number) {
  const digits = paperNoDigits(paperNo)
  doc.setFontSize(FONTS.small)
  doc.setFont('helvetica', 'bold')
  doc.text('Paper code (printed)', l.code.label.x, l.code.label.y + 2.5)
  doc.setFont('helvetica', 'normal')
  drawDigitLabels(doc, l.code.digitLabels)

  doc.setLineWidth(LINE_W)
  doc.setFillColor(0, 0, 0)
  l.code.columns.forEach((col, i) => {
    const b = col.writeBox
    doc.rect(b.x, b.y, b.width, b.height, 'S')
    doc.setFontSize(FONTS.header)
    doc.text(String(digits[i]), b.x + b.width / 2 - textWidthMm('0', FONTS.header) / 2, b.y + b.height / 2, MIDDLE)
    for (const bub of col.bubbles) doc.circle(bub.x, bub.y, bub.r, bub.value === digits[i] ? 'FD' : 'S')
  })
}

function drawDigitLabels(doc: Doc, labels: AnswerSheetLayout['code']['digitLabels']) {
  doc.setFontSize(FONTS.digit)
  for (const d of labels) doc.text(String(d.value), d.x, d.y, MIDDLE)
}

function drawQuestions(doc: Doc, l: AnswerSheetLayout) {
  doc.setLineWidth(LINE_W)
  for (const q of l.questions) {
    if (q.groupHeader) {
      doc.setFontSize(FONTS.option)
      q.groupHeader.labels.forEach((label, i) => {
        const a = q.groupHeader!.anchors[i]!
        doc.text(label, a.x, a.y, MIDDLE)
      })
    }
    doc.setFontSize(FONTS.number)
    doc.text(String(q.q), q.numberAnchor.x, q.numberAnchor.y, MIDDLE)
    for (const o of q.options) doc.circle(o.x, o.y, o.r, 'S')
    if (q.pointer) {
      doc.setFontSize(FONTS.option)
      doc.text('numeric box', q.pointer.x, q.pointer.y, MIDDLE)
    }
  }
}

function drawNumeric(doc: Doc, l: AnswerSheetLayout) {
  doc.setLineWidth(LINE_W)
  doc.setFillColor(0, 0, 0)
  for (const box of l.numeric) {
    doc.setFontSize(FONTS.small)
    doc.setFont('helvetica', 'bold')
    doc.text(`Q${box.q}`, box.label.x, box.label.y + 2.5)
    doc.setFont('helvetica', 'normal')
    drawDigitLabels(doc, box.digitLabels)
    for (const col of box.columns) {
      const b = col.writeBox
      doc.rect(b.x, b.y, b.width, b.height, 'S')
      for (const bub of col.bubbles) doc.circle(bub.x, bub.y, bub.r, 'S')
    }
    doc.circle(box.dot.x, box.dot.y, 0.35, 'F')
  }
}

/** The answer sheet for one paper test, as a PDF. */
export async function renderAnswerSheetPdf(sheet: AnswerSheet): Promise<Blob> {
  paperNoDigits(sheet.paperNo)
  const layout = buildAnswerSheetLayout(sheet.formats)
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [layout.page.width, layout.page.height] })
  doc.setFont('helvetica', 'normal')
  doc.setDrawColor(0, 0, 0)
  doc.setTextColor(0, 0, 0)

  drawHeader(doc, layout, sheet)
  drawInstructions(doc, layout)
  drawRegistration(doc, layout)
  drawCode(doc, layout, sheet.paperNo)
  drawQuestions(doc, layout)
  drawNumeric(doc, layout)

  return doc.output('blob')
}
