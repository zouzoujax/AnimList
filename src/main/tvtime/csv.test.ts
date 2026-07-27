import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('keys each row by the header', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' }
    ])
  })

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([])
  })

  it('returns nothing when there is only a header', () => {
    expect(parseCsv('a,b\n')).toEqual([])
  })

  it('reads a row that is not terminated by a newline', () => {
    expect(parseCsv('a\n1')).toEqual([{ a: '1' }])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }])
  })

  it('strips a byte-order mark from the first column name', () => {
    // Glued to the header, the BOM would make every lookup on that column miss.
    const rows = parseCsv('﻿tv_show_id,name\n42,Bleach')
    expect(rows[0].tv_show_id).toBe('42')
  })
})

describe('champs entre guillemets', () => {
  it('keeps a comma inside quotes', () => {
    expect(parseCsv('title\n"Kaguya-sama, Love Is War"')).toEqual([
      { title: 'Kaguya-sama, Love Is War' }
    ])
  })

  it('unescapes a doubled quote', () => {
    expect(parseCsv('title\n"He said ""hi"""')).toEqual([{ title: 'He said "hi"' }])
  })

  it('keeps a newline inside quotes', () => {
    expect(parseCsv('a,b\n"one\ntwo",x')).toEqual([{ a: 'one\ntwo', b: 'x' }])
  })

  it('reads an empty quoted field', () => {
    expect(parseCsv('a,b\n"",x')).toEqual([{ a: '', b: 'x' }])
  })

  it('treats a quote in the middle of a field as literal', () => {
    expect(parseCsv('a\n5" screen')).toEqual([{ a: '5" screen' }])
  })
})

describe('lignes irrégulières', () => {
  it('skips blank lines', () => {
    expect(parseCsv('a\n1\n\n2\n')).toEqual([{ a: '1' }, { a: '2' }])
  })

  it('pads a short row with empty strings rather than undefined', () => {
    const rows = parseCsv('a,b,c\n1,2')
    expect(rows).toEqual([{ a: '1', b: '2', c: '' }])
    // Callers read these straight into Number(); undefined would give NaN.
    expect(rows[0].c).toBe('')
  })

  it('ignores columns beyond the header', () => {
    expect(parseCsv('a\n1,2,3')).toEqual([{ a: '1' }])
  })

  it('keeps an all-empty row that has real separators', () => {
    // ",," is three empty columns — a real record, unlike a blank line.
    expect(parseCsv('a,b,c\n,,')).toEqual([{ a: '', b: '', c: '' }])
  })
})
