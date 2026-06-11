// Minimal RFC-4180 CSV parser — handles quoted fields, escaped quotes ("")
// and newlines inside quotes. Enough for HubSpot/Salesforce exports without
// pulling in a dependency.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Strip a UTF-8 BOM (Excel/HubSpot exports often start with one).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
      continue
    }
    field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

export function parseCsvWithHeaders(text: string): ParsedCsv {
  const raw = parseCsv(text)
  if (!raw.length) return { headers: [], rows: [] }
  const headers = raw[0].map((h) => h.trim())
  const rows = raw.slice(1).map((r) => {
    const o: Record<string, string> = {}
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim() })
    return o
  })
  return { headers, rows }
}
