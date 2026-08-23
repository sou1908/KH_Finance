// Indian numbering throughout — 12,34,567 not 1,234,567.
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

export function money(value) {
  return inr.format(Number(value) || 0)
}

/** Compact form for tight cells: ₹1.45 L, ₹2.3 Cr. */
export function moneyShort(value) {
  const n = Number(value) || 0
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${plain.format(+(abs / 1e7).toFixed(2))} Cr`
  if (abs >= 1e5) return `${sign}₹${plain.format(+(abs / 1e5).toFixed(2))} L`
  if (abs >= 1e3) return `${sign}₹${plain.format(Math.round(abs / 1e3))} K`
  return `${sign}₹${plain.format(abs)}`
}

export function num(value) {
  return plain.format(Number(value) || 0)
}

export function pct(ratio, digits = 0) {
  return `${((Number(ratio) || 0) * 100).toFixed(digits)}%`
}

export function shortDate(iso) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function monthLabel(ym) {
  if (!ym) return '—'
  const d = new Date(`${ym}-01T00:00:00`)
  if (Number.isNaN(d.getTime())) return ym
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

export function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Download any row set as CSV — the escape hatch every accountant asks for. */
export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = columns.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => esc(c.get(r))).join(',')).join('\n')
  return `${head}\n${body}`
}

export function downloadCSV(filename, csv) {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
