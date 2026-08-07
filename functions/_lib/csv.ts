// Minimal CSV writer — good enough for exports that are read in
// Excel/Sheets, not a general-purpose CSV library. Always quotes a field
// containing a comma, quote, or newline, doubling any embedded quotes per
// RFC 4180.
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvField).join(',')]
  for (const row of rows) lines.push(row.map(csvField).join(','))
  return lines.join('\r\n')
}

export function csvResponse(filename: string, header: string[], rows: unknown[][]): Response {
  return new Response(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
