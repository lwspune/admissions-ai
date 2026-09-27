// CSV reading. Pure, and written here rather than pulled in as a dependency:
// the job is one RFC 4180 reader, and the input that matters — lead sheets
// whose remarks are full of commas and quotes — is exactly what the tests
// pin down.
//
// Records are returned exactly as written, blank ones included, so record N
// is spreadsheet row N+1 and a skipped-row report can point at the sheet.
// Trimming and meaning belong to the importer (src/lib/leads.ts).

export class CsvError extends Error {}

export function parseCsv(text: string): string[][] {
  const input = text.startsWith('﻿') ? text.slice(1) : text
  const records: string[][] = []
  if (input === '') return records

  let record: string[] = []
  let field = ''
  let quoted = false
  let quoteOpenedIn = 0
  let i = 0

  const endField = () => {
    record.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    records.push(record)
    record = []
  }

  while (i < input.length) {
    const ch = input[i]

    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
      } else {
        field += ch
      }
      i++
      continue
    }

    if (ch === '"' && field === '') {
      quoted = true
      quoteOpenedIn = records.length + 1
    } else if (ch === ',') {
      endField()
    } else if (ch === '\r') {
      endRecord()
      if (input[i + 1] === '\n') i++
    } else if (ch === '\n') {
      endRecord()
    } else {
      field += ch
    }
    i++
  }

  if (quoted) {
    throw new CsvError(`A quote opened on row ${quoteOpenedIn} is never closed.`)
  }

  // A final line break ends the last record; it does not start another.
  if (field !== '' || record.length > 0) endRecord()
  return records
}
