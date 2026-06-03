import { describe, it, expect } from 'vitest'
import { formatBytes, truncateText, formatNumber, formatPercent, formatDateTime, formatList } from './format'

describe('formatBytes', () => {
  it('returns 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('returns 0 B for negative', () => {
    expect(formatBytes(-100)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats MB', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB')
  })

  it('formats GB', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB')
  })

  it('handles string input', () => {
    expect(formatBytes('2048')).toBe('2.0 KB')
  })

  it('returns 0 B for non-numeric', () => {
    expect(formatBytes('abc')).toBe('0 B')
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(undefined)).toBe('0 B')
  })
})

describe('truncateText', () => {
  it('returns empty for falsy input', () => {
    expect(truncateText('')).toBe('')
    expect(truncateText(null)).toBe('')
    expect(truncateText(undefined)).toBe('')
  })

  it('returns text if shorter than max', () => {
    expect(truncateText('hello', 10)).toBe('hello')
  })

  it('truncates long text', () => {
    expect(truncateText('hello world', 5)).toBe('hello...')
  })

  it('uses default max of 160', () => {
    const long = 'a'.repeat(200)
    expect(truncateText(long)).toBe('a'.repeat(160) + '...')
  })
})

describe('formatNumber', () => {
  it('formats numbers with locale', () => {
    expect(formatNumber(1234)).toBe('1,234')
  })

  it('returns -- for non-finite', () => {
    expect(formatNumber(NaN)).toBe('--')
    expect(formatNumber(Infinity)).toBe('--')
    expect(formatNumber('abc')).toBe('--')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('handles string numbers', () => {
    expect(formatNumber('9999')).toBe('9,999')
  })
})

describe('formatPercent', () => {
  it('formats with one decimal', () => {
    expect(formatPercent(85.6)).toBe('85.6%')
  })

  it('returns -- for non-finite', () => {
    expect(formatPercent(NaN)).toBe('--')
  })

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.0%')
  })
})

describe('formatDateTime', () => {
  it('formats a date string', () => {
    const result = formatDateTime('2026-01-15T10:30:00')
    expect(result).toContain('2026')
    expect(result).toContain('10:30')
  })

  it('returns -- for invalid date', () => {
    expect(formatDateTime('invalid')).toBe('--')
  })

  it('formats Date object', () => {
    const result = formatDateTime(new Date(2026, 0, 15, 14, 30, 0))
    expect(result).toContain('2026')
  })
})

describe('formatList', () => {
  it('joins with Chinese comma', () => {
    expect(formatList(['a', 'b', 'c'])).toBe('a、b、c')
  })

  it('returns 暂无 for empty', () => {
    expect(formatList([])).toBe('暂无')
    expect(formatList(null)).toBe('暂无')
  })

  it('filters falsy values', () => {
    expect(formatList(['a', '', null, 'b'])).toBe('a、b')
  })
})
