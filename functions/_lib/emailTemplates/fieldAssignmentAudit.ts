import { escapeHtml } from '../email'
import { renderPinnacleEmailLayout } from './layout'

// Snapshot of a completed field or RON assignment, rendered as a branded,
// print-friendly email that doubles as the client's audit trail. Uses only
// the subset of the assignment row we need to make the template easy to
// test without spinning up D1.

export interface FieldAssignmentAuditAssignment {
  id: string
  kind: string
  service_key: string
  title: string | null
  site_label: string | null
  site_address: string | null
  site_city: string | null
  site_state: string | null
  site_postal_code: string | null
  scheduled_at: string | null
  departed_at: string | null
  depart_lat: number | null
  depart_lng: number | null
  arrived_at: string | null
  arrival_lat: number | null
  arrival_lng: number | null
  arrival_source: string | null
  completed_at: string | null
  completion_lat: number | null
  completion_lng: number | null
  vendor_signature_type: string | null
  vendor_signature_name: string | null
  vendor_signature_image_key: string | null
  vendor_signed_at: string | null
  vendor_signed_ip: string | null
  notes: string | null
  client_name?: string | null
  vendor_name?: string | null
}

export interface FieldAssignmentAuditDocument {
  document_type: string
  signer_names: string
  witness_role: number
  oath_administered: number
  stamps_count: number
  notes: string | null
}

export interface FieldAssignmentAuditInput {
  assignment: FieldAssignmentAuditAssignment
  documents: FieldAssignmentAuditDocument[]
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const date = new Date(iso)
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

function fmtCoord(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return ''
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function mapsLink(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return ''
  return `https://www.google.com/maps?q=${lat},${lng}`
}

function siteLine(a: FieldAssignmentAuditAssignment): string {
  const address = [a.site_address, a.site_city, a.site_state, a.site_postal_code].filter(Boolean).join(', ')
  return a.site_label && address ? `${a.site_label} — ${address}` : (a.site_label || address || '—')
}

function parseSigners(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

function documentsHtml(documents: FieldAssignmentAuditDocument[]): string {
  if (documents.length === 0) return `<p style="margin:12px 0;color:#6f7784">No documents were recorded.</p>`
  const rows = documents.map((doc) => {
    const signers = parseSigners(doc.signer_names)
    return `
    <tr>
      <td style="padding:12px 14px;border-top:1px solid #e4e8ee;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0b1728;vertical-align:top">
        <div style="font-weight:600">${escapeHtml(doc.document_type)}</div>
        ${signers.length ? `<div style="margin-top:4px;color:#4a5567;font-size:12px">Signers: ${escapeHtml(signers.join(', '))}</div>` : ''}
        ${doc.notes ? `<div style="margin-top:4px;color:#6f7784;font-size:12px">${escapeHtml(doc.notes)}</div>` : ''}
      </td>
      <td style="padding:12px 14px;border-top:1px solid #e4e8ee;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#4a5567;text-align:right;white-space:nowrap;vertical-align:top">
        ${doc.oath_administered ? `<div style="color:#0b1728">Oath administered</div>` : ''}
        ${doc.witness_role ? `<div style="color:#0b1728">Notary/vendor served as witness</div>` : ''}
        <div>Stamps: <strong style="color:#0b1728">${doc.stamps_count}</strong></div>
      </td>
    </tr>`
  }).join('')
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 4px;border:1px solid #e4e8ee;border-radius:8px;overflow:hidden">
      <thead>
        <tr>
          <th align="left" style="padding:10px 14px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#6f7784">Document + signers</th>
          <th align="right" style="padding:10px 14px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#6f7784">Details</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function checkpointHtml(a: FieldAssignmentAuditAssignment): string {
  if (a.kind === 'ron') {
    return `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0;border:1px solid #e4e8ee;border-radius:8px">
        <tr>
          <td style="padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0b1728">
            <strong>Remote Online Notarization</strong> — no in-person travel. Session completed ${escapeHtml(fmtDate(a.completed_at))}.
          </td>
        </tr>
      </table>`
  }
  const rows: string[] = []
  const push = (label: string, at: string | null, lat: number | null, lng: number | null, extra?: string) => {
    if (!at) return
    const coord = fmtCoord(lat, lng)
    const link = mapsLink(lat, lng)
    rows.push(`
      <tr>
        <td style="padding:10px 14px;border-top:1px solid #e4e8ee;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0b1728;white-space:nowrap;vertical-align:top"><strong>${escapeHtml(label)}</strong></td>
        <td style="padding:10px 14px;border-top:1px solid #e4e8ee;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#344153;vertical-align:top">
          ${escapeHtml(fmtDate(at))}
          ${extra ? `<div style="color:#6f7784;font-size:11px;margin-top:3px">${escapeHtml(extra)}</div>` : ''}
          ${coord ? `<div style="color:#6f7784;font-size:11px;margin-top:3px">GPS: <a href="${escapeHtml(link)}" style="color:#b89653;text-decoration:none">${escapeHtml(coord)}</a></div>` : ''}
        </td>
      </tr>`)
  }
  push('Departed for site', a.departed_at, a.depart_lat, a.depart_lng)
  push('Arrived on site', a.arrived_at, a.arrival_lat, a.arrival_lng, a.arrival_source === 'auto_geofence' ? 'Auto-detected by geofence' : 'Marked by vendor')
  push('Job completed', a.completed_at, a.completion_lat, a.completion_lng)
  if (rows.length === 0) return ''
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0;border:1px solid #e4e8ee;border-radius:8px;overflow:hidden">
      <thead><tr>
        <th align="left" colspan="2" style="padding:10px 14px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#6f7784">Time + location checkpoints</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`
}

function signatureHtml(a: FieldAssignmentAuditAssignment): string {
  const kind = a.vendor_signature_type === 'drawn' ? 'Drawn signature captured on device' : 'Typed name'
  const value = a.vendor_signature_name || (a.vendor_signature_type === 'drawn' ? 'Signature image on file' : '—')
  // Drawn signatures land in vendor_signature_image_key as a data:image/png URL
  // (see routes/fieldWork.ts complete handler). Only render inline when it
  // clearly looks like a data URL so we never accidentally embed an R2 key.
  const inlineImage = a.vendor_signature_type === 'drawn' && a.vendor_signature_image_key && a.vendor_signature_image_key.startsWith('data:image')
    ? `<div style="margin-top:8px;padding:8px;background:#ffffff;border:1px dashed #e4e8ee;border-radius:6px"><img src="${escapeHtml(a.vendor_signature_image_key)}" alt="Vendor signature" style="max-height:80px;max-width:100%;display:block"></div>`
    : ''
  return `
    <div style="margin-top:8px;padding:14px;border:1px solid #e4e8ee;border-radius:8px;background:#fbfcfd">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#6f7784">Vendor signature</div>
      <div style="margin-top:6px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#0b1728">${escapeHtml(value)}</div>
      ${inlineImage}
      <div style="margin-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6f7784">${escapeHtml(kind)} · ${escapeHtml(fmtDate(a.vendor_signed_at))}${a.vendor_signed_ip ? ` · IP ${escapeHtml(a.vendor_signed_ip)}` : ''}</div>
    </div>`
}

export function renderFieldAssignmentAuditEmail(input: FieldAssignmentAuditInput): RenderedEmail {
  const a = input.assignment
  const isRon = a.kind === 'ron'
  const title = isRon ? 'Your Remote Online Notarization audit trail' : 'Your service audit trail'
  const eyebrow = isRon ? 'RON session completed' : 'Assignment completed'
  const subject = a.title
    ? `${a.title} — audit trail (Pinnacle)`
    : isRon ? 'Your Pinnacle RON session — audit trail' : 'Your Pinnacle service assignment — audit trail'
  const client = escapeHtml((a.client_name || 'Client').split(' ')[0])
  const totalStamps = input.documents.reduce((sum, d) => sum + (d.stamps_count || 0), 0)

  const bodyHtml = `
    <p style="margin:0 0 14px">Hi ${client},</p>
    <p style="margin:0 0 14px">Below is the complete audit trail for ${isRon ? 'your Remote Online Notarization session' : 'your service assignment'} with Pinnacle. Save or print this email — it is the official record.</p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;border:1px solid #e4e8ee;border-radius:8px;background:#f6f7f9">
      <tr><td style="padding:14px 16px">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#6f7784">${escapeHtml(a.service_key.replace(/_/g, ' '))}</div>
        <div style="margin-top:4px;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#0b1728">${escapeHtml(a.title || 'Assignment')}</div>
        <div style="margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#344153">${escapeHtml(siteLine(a))}</div>
        <div style="margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6f7784">
          Vendor: <strong style="color:#0b1728">${escapeHtml(a.vendor_name || 'Pinnacle Professional')}</strong>
          &nbsp;·&nbsp; Documents processed: <strong style="color:#0b1728">${input.documents.length}</strong>
          &nbsp;·&nbsp; Stamps: <strong style="color:#0b1728">${totalStamps}</strong>
        </div>
      </td></tr>
    </table>

    ${checkpointHtml(a)}
    ${documentsHtml(input.documents)}
    ${signatureHtml(a)}

    ${a.notes ? `<div style="margin-top:14px;padding:12px 14px;border-left:3px solid #d7b56d;background:#fdf9ef;color:#4a5567;font-family:Arial,Helvetica,sans-serif;font-size:13px"><strong style="color:#0b1728;display:block;margin-bottom:4px">Additional notes</strong>${escapeHtml(a.notes)}</div>` : ''}

    <p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6f7784">Reference ID: <code style="font-family:Menlo,Consolas,monospace">${escapeHtml(a.id)}</code></p>
  `

  const html = renderPinnacleEmailLayout({
    preheader: 'Your Pinnacle audit trail is attached inside this email.',
    eyebrow,
    title,
    bodyHtml,
    securityNote: 'This is a certified transactional audit record. If any detail looks wrong, reply to this email so we can correct it and re-issue the record.',
  })

  const textLines: string[] = []
  textLines.push(`Pinnacle Management Ventures — Audit Trail`)
  textLines.push(`Assignment: ${a.title || a.service_key.replace(/_/g, ' ')}`)
  textLines.push(`Site: ${siteLine(a)}`)
  textLines.push(`Vendor: ${a.vendor_name || 'Pinnacle Professional'}`)
  textLines.push('')
  if (!isRon) {
    if (a.departed_at) textLines.push(`Departed: ${fmtDate(a.departed_at)}${a.depart_lat !== null ? ` (${fmtCoord(a.depart_lat, a.depart_lng)})` : ''}`)
    if (a.arrived_at) textLines.push(`Arrived: ${fmtDate(a.arrived_at)}${a.arrival_lat !== null ? ` (${fmtCoord(a.arrival_lat, a.arrival_lng)})` : ''}`)
  }
  if (a.completed_at) textLines.push(`Completed: ${fmtDate(a.completed_at)}${a.completion_lat !== null ? ` (${fmtCoord(a.completion_lat, a.completion_lng)})` : ''}`)
  textLines.push('')
  textLines.push(`Documents (${input.documents.length}):`)
  for (const doc of input.documents) {
    const signers = parseSigners(doc.signer_names)
    textLines.push(` - ${doc.document_type}${signers.length ? ` — signers: ${signers.join(', ')}` : ''}${doc.witness_role ? ' — vendor witness' : ''}${doc.oath_administered ? ' — oath administered' : ''} — stamps: ${doc.stamps_count}`)
  }
  textLines.push('')
  textLines.push(`Signed by: ${a.vendor_signature_name || 'signature image on file'} (${a.vendor_signature_type || 'typed'})`)
  textLines.push(`Signed at: ${fmtDate(a.vendor_signed_at)}${a.vendor_signed_ip ? ` (IP ${a.vendor_signed_ip})` : ''}`)
  textLines.push('')
  textLines.push(`Reference: ${a.id}`)

  return { subject, html, text: textLines.join('\n') }
}
