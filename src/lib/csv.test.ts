import { describe, it, expect } from 'vitest'
import { parseCsv, CsvError } from './csv'

describe('parseCsv', () => {
  it('splits rows and fields', () => {
    expect(parseCsv('NAME,CONTACT\nAtharv,7744925024\n')).toEqual([
      ['NAME', 'CONTACT'],
      ['Atharv', '7744925024'],
    ])
  })

  it('accepts Windows line endings — Excel writes them', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('keeps a comma inside a quoted field — remarks are full of them', () => {
    expect(parseCsv('NAME,REMARK\nParth,"had a talk with parents , told them about SPI"')).toEqual([
      ['NAME', 'REMARK'],
      ['Parth', 'had a talk with parents , told them about SPI'],
    ])
  })

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('a\n"he said ""call later"""')).toEqual([['a'], ['he said "call later"']])
  })

  it('keeps a line break inside a quoted field as one record', () => {
    expect(parseCsv('a,b\n"line one\nline two",x\nnext,y')).toEqual([
      ['a', 'b'],
      ['line one\nline two', 'x'],
      ['next', 'y'],
    ])
  })

  it('strips the byte-order mark Excel puts at the start of a UTF-8 file', () => {
    expect(parseCsv('﻿NAME,CONTACT\nA,1')[0]).toEqual(['NAME', 'CONTACT'])
  })

  it('keeps blank records, so record numbers still match spreadsheet rows', () => {
    expect(parseCsv('a\n\nb\n')).toEqual([['a'], [''], ['b']])
  })

  it('keeps empty fields, including a trailing one', () => {
    expect(parseCsv('a,,c,\n')).toEqual([['a', '', 'c', '']])
  })

  it('does not trim unquoted whitespace — cleaning is the importer’s job', () => {
    expect(parseCsv('CONNECTED ,x')).toEqual([['CONNECTED ', 'x']])
  })

  it('refuses a quote that is never closed, naming the record', () => {
    expect(() => parseCsv('a\n"open\nb')).toThrow(CsvError)
    expect(() => parseCsv('a\n"open\nb')).toThrow(/row 2/)
  })

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('﻿')).toEqual([])
  })
})
