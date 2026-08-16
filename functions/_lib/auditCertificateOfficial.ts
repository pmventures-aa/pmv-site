import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Env } from './types'
import {
  buildEvidenceLine,
  describeEnvelopeEvent,
  fieldTypeLabel,
  formatAuditDateHeading,
  formatAuditTimeOnly,
  formatAuditTimestamp,
  formatCoordinates,
  shortSnapshotHash,
} from './auditTrailFormat'
import { PUBLIC_SITE_URL } from './appUrls'

const navy = rgb(0.035, 0.075, 0.13)
const gold = rgb(0.72, 0.56, 0.18)
const ink = rgb(0.10, 0.13, 0.17)
const muted = rgb(0.39, 0.42, 0.46)
const line = rgb(0.86, 0.87, 0.89)
const pale = rgb(0.975, 0.976, 0.978)
const green = rgb(0.10, 0.42, 0.25)
const white = rgb(1, 1, 1)

export interface AuditCertificateContext {
  ownerName: string
  ownerEmail: string
  verifyUrl: string
  pageCount: number
  initializedAt: string | null
  initializedSnapshot: string | null
  finalizedSnapshot: string | null
  sourceFileName: string
  sealAlgorithm?: string
  sealKeyId?: string
  sealSignature?: string
  verificationId?: string
}

function safe(v: unknown, max = 3000): string {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max)
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= max) current = next
    else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

async function sha(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function loadBrand(env: Env, envelope: Record<string, unknown>, pdf: PDFDocument) {
  let profile: Record<string, unknown> | null = null
  if (envelope.branding_profile_version_id) {
    const v = await env.DB.prepare('SELECT snapshot_json FROM branding_profile_versions WHERE id = ?')
      .bind(envelope.branding_profile_version_id).first<{ snapshot_json?: string }>()
    if (v?.snapshot_json) {
      try { profile = JSON.parse(v.snapshot_json) } catch { /* ignore */ }
    }
  }
  if (!profile && envelope.branding_profile_id) {
    profile = await env.DB.prepare('SELECT * FROM branding_profiles WHERE id = ?')
      .bind(envelope.branding_profile_id).first<Record<string, unknown>>()
  }
  if (!profile) {
    profile = await env.DB.prepare("SELECT * FROM branding_profiles WHERE status = 'active' AND is_default = 1 ORDER BY updated_at DESC LIMIT 1")
      .first<Record<string, unknown>>()
  }
  let logo: PDFImage | null = null
  const logoId = profile?.logo_file_id
  if (logoId && env.UPLOADS) {
    const f = await env.DB.prepare('SELECT storage_key, mime_type FROM document_files WHERE id = ?')
      .bind(logoId).first<{ storage_key?: string; mime_type?: string }>()
    if (f?.storage_key) {
      const obj = await env.UPLOADS.get(f.storage_key)
      if (obj) {
        const bytes = new Uint8Array(await obj.arrayBuffer())
        try {
          logo = String(f.mime_type || '').includes('jpeg') || String(f.mime_type || '').includes('jpg')
            ? await pdf.embedJpg(bytes)
            : await pdf.embedPng(bytes)
        } catch { /* ignore */ }
      }
    }
  }
  if (!logo) {
    try {
      const r = await fetch('https://www.pinnaclemanagementventures.com/logo-crest-transparent.png')
      if (r.ok) logo = await pdf.embedPng(new Uint8Array(await r.arrayBuffer()))
    } catch { /* ignore */ }
  }
  return { profile, logo }
}

function pageChrome(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  logo: PDFImage | null,
  pageNo: number,
  totalPages: number,
  publicId: string,
  title: string,
) {
  page.drawRectangle({ x: 0, y: 744, width: 612, height: 48, color: navy })
  if (logo) {
    const s = logo.scale(1)
    const h = 27
    const w = h * (s.width / s.height)
    page.drawImage(logo, { x: 38, y: 754, width: w, height: h })
  }
  page.drawText('PINNACLE MANAGEMENT VENTURES', { x: logo ? 76 : 38, y: 766, size: 8.8, font: bold, color: white })
  page.drawText('DOCUMENT INTEGRITY SYSTEM', { x: logo ? 76 : 38, y: 753, size: 6.2, font: regular, color: gold })
  page.drawText(title.toUpperCase(), { x: 360, y: 766, size: 7, font: bold, color: white, maxWidth: 212 })
  page.drawText(`${publicId}  |  PAGE ${pageNo} OF ${totalPages}`, { x: 360, y: 753, size: 6.1, font: regular, color: rgb(0.76, 0.79, 0.82), maxWidth: 212 })
  page.drawLine({ start: { x: 38, y: 36 }, end: { x: 574, y: 36 }, thickness: 0.55, color: line })
  page.drawText('Pinnacle Management Ventures', { x: 38, y: 20, size: 6.2, font: regular, color: muted })
  page.drawText(`${PUBLIC_SITE_URL.replace('https://', '')}/verify`, { x: 392, y: 20, size: 6.2, font: regular, color: navy })
  page.drawText(`Document ID: ${publicId}`, { x: 38, y: 8, size: 5.8, font: regular, color: muted })
}

function sectionTitle(page: PDFPage, bold: PDFFont, text: string, y: number) {
  page.drawText(text.toUpperCase(), { x: 42, y, size: 8, font: bold, color: navy })
  page.drawLine({ start: { x: 42, y: y - 9 }, end: { x: 570, y: y - 9 }, thickness: 0.7, color: line })
}

function labelValue(page: PDFPage, regular: PDFFont, bold: PDFFont, label: string, value: string, y: number) {
  page.drawText(label, { x: 42, y, size: 7.2, font: bold, color: muted })
  for (const [index, lineText] of wrap(value, 88).entries()) {
    page.drawText(lineText, { x: 150, y: y - index * 11, size: 8.4, font: regular, color: ink, maxWidth: 420 })
  }
}

export async function renderOfficialAuditCertificate(
  env: Env,
  envelope: Record<string, unknown>,
  recipients: Record<string, unknown>[],
  fields: Record<string, unknown>[],
  events: Record<string, unknown>[],
  signedPdfHash: string,
  chainHead: string,
  sealedAt: string,
  context: AuditCertificateContext,
) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const { profile, logo } = await loadBrand(env, envelope, pdf)
  const legal = String(profile?.legal_disclaimer || 'This audit record documents the configured electronic-signature workflow and associated integrity evidence maintained by Pinnacle Management Ventures. It is not, by itself, a notarization, legal opinion, or guarantee of admissibility.')
  const recipientsById = new Map(recipients.map((recipient) => [String(recipient.id), recipient]))
  const publicId = safe(envelope.public_id, 90)
  const docTitle = safe(context.sourceFileName || envelope.title, 180)
  const initializedAt = context.initializedAt || String(envelope.sent_at || envelope.created_at || sealedAt)
  const initializedSnapshot = context.initializedSnapshot || shortSnapshotHash(chainHead)
  const finalizedSnapshot = context.finalizedSnapshot || shortSnapshotHash(signedPdfHash)

  const pages: PDFPage[] = []
  const addPage = (title: string) => {
    const page = pdf.addPage([612, 792])
    pages.push(page)
    return page
  }

  // PAGE 1 — AUDIT SUMMARY
  let page = addPage('Audit Summary')
  page.drawText(`Audit of '${docTitle}'`, { x: 42, y: 704, size: 18, font: bold, color: navy, maxWidth: 528 })
  page.drawText('This document is a FINALIZED sign request', { x: 42, y: 682, size: 9.5, font: bold, color: green })

  let y = 648
  labelValue(page, regular, bold, 'File Owner', context.ownerName || context.ownerEmail || 'Pinnacle Management Ventures', y); y -= 28
  labelValue(page, regular, bold, 'Initialized', `${formatAuditTimestamp(initializedAt)}  ${initializedSnapshot}`, y); y -= 28
  labelValue(page, regular, bold, 'Finalized', `${formatAuditTimestamp(envelope.completed_at || sealedAt)}  ${finalizedSnapshot}`, y); y -= 28
  labelValue(page, regular, bold, 'Unique Url', context.verifyUrl, y); y -= 36
  if (context.verificationId) { labelValue(page, regular, bold, 'Verification ID', context.verificationId, y); y -= 36 }
  labelValue(page, regular, bold, 'Page Count', String(context.pageCount), y); y -= 40

  sectionTitle(page, bold, 'Signers', y)
  y -= 22
  for (const recipient of recipients.filter((r) => ['signer', 'approver', 'witness', 'notary'].includes(String(r.role)))) {
    if (y < 180) break
    const status = String(recipient.status || '').toUpperCase()
    const recipientEvents = events.filter((event) => event.recipient_id === recipient.id)
    const consent = recipientEvents.find((event) => event.event_type === 'consent.esign_accepted')
    let consentText = 'Verified consent to Esign'
    if (consent) {
      try {
        const meta = JSON.parse(String(consent.metadata_json || '{}'))
        if (meta.policy_version) consentText += ` (policy v${meta.policy_version})`
      } catch { /* keep base text */ }
    }
    const auth = recipientEvents.find((event) => event.event_type === 'authentication.passed')
    const locationEvent = [...recipientEvents].reverse().find((event) => event.geo_lat_approx != null || event.event_type === 'location.reported')
    const ip = recipientEvents.find((event) => event.ip_address)?.ip_address
      || auth?.ip_address
      || locationEvent?.ip_address

    page.drawText(`${safe(recipient.email, 180)}  ${status}`, { x: 42, y, size: 8.6, font: bold, color: ink, maxWidth: 528 })
    y -= 14
    page.drawText(`Signer - ${safe(recipient.name, 120)}`, { x: 42, y, size: 7.4, font: regular, color: ink })
    y -= 12
    const signerEvidence = [
      ip ? `Verified IP ${safe(ip, 120)}` : null,
      consent ? consentText : null,
      auth ? `Auth method: ${safe((() => { try { return JSON.parse(String(auth.metadata_json || '{}')).method } catch { return null } })(), 40) || 'verified'}` : null,
    ].filter(Boolean).join('   ')
    if (signerEvidence) {
      page.drawText(signerEvidence, { x: 42, y, size: 6.8, font: regular, color: muted, maxWidth: 528 })
      y -= 12
    }
    const coords = formatCoordinates(locationEvent?.geo_lat_approx, locationEvent?.geo_lon_approx)
    if (coords) {
      page.drawText(`Signer's reported location: ${coords}`, { x: 42, y, size: 6.8, font: regular, color: muted, maxWidth: 528 })
      y -= 12
    }
    page.drawText(`Document "after" snapshot: ${formatAuditTimestamp(recipient.completed_at || sealedAt)}  ${finalizedSnapshot}`, { x: 42, y, size: 6.8, font: regular, color: muted, maxWidth: 528 })
    y -= 22
  }

  sectionTitle(page, bold, 'Assigned Fields', Math.max(120, y))
  y = Math.max(104, y - 22)
  page.drawText('Value', { x: 42, y, size: 6.5, font: bold, color: muted })
  page.drawText('Type', { x: 250, y, size: 6.5, font: bold, color: muted })
  page.drawText('Req.', { x: 320, y, size: 6.5, font: bold, color: muted })
  page.drawText('Page #', { x: 360, y, size: 6.5, font: bold, color: muted })
  page.drawText('Updated', { x: 420, y, size: 6.5, font: bold, color: muted })
  y -= 10
  page.drawLine({ start: { x: 42, y }, end: { x: 570, y }, thickness: 0.5, color: line })
  y -= 14

  const completedFields = fields.filter((field) => field.completed_at)
  for (const field of completedFields.slice(0, 12)) {
    if (y < 72) break
    const label = safe(field.label || `${fieldTypeLabel(field.field_type)} Field`, 80)
    const value = field.field_type === 'checkbox'
      ? (String(field.value_text) === 'true' ? 'Checked' : 'Unchecked')
      : safe(field.value_text || label, 80)
    page.drawText(value, { x: 42, y, size: 7, font: regular, color: ink, maxWidth: 190 })
    page.drawText(fieldTypeLabel(field.field_type), { x: 250, y, size: 7, font: regular, color: ink })
    page.drawText(Number(field.required) === 1 ? 'Yes' : 'No', { x: 328, y, size: 7, font: regular, color: ink })
    page.drawText(String(field.page_number || 1), { x: 368, y, size: 7, font: regular, color: ink })
    page.drawText(formatAuditTimestamp(field.completed_at), { x: 420, y, size: 6.4, font: regular, color: muted, maxWidth: 150 })
    y -= 16
  }

  // PAGE 2+ — EVENT HISTORY
  page = addPage('Event History')
  page.drawText('Event History', { x: 42, y: 704, size: 17, font: bold, color: navy })
  y = 676
  let currentDate = ''

  for (const event of events) {
    const renderEvent = () => {
      const described = describeEnvelopeEvent({ event, recipientsById, ownerEmail: context.ownerEmail })
      const time = formatAuditTimeOnly(event.occurred_at_utc)
      page.drawText(`${time} ${described.headline}`, { x: 42, y, size: 7.4, font: bold, color: ink, maxWidth: 528 })
      y -= 12
      if (described.detail) {
        for (const lineText of wrap(described.detail, 104)) {
          page.drawText(lineText, { x: 58, y, size: 6.8, font: regular, color: muted, maxWidth: 512 })
          y -= 10
        }
      }
      const evidence = described.evidence || buildEvidenceLine(event)
      if (evidence) {
        for (const lineText of wrap(evidence, 104)) {
          page.drawText(lineText, { x: 58, y, size: 6.4, font: regular, color: muted, maxWidth: 512 })
          y -= 10
        }
      }
      y -= 6
    }

    const dateHeading = formatAuditDateHeading(event.occurred_at_utc)
    if (dateHeading !== currentDate) {
      if (y < 120) {
        page = addPage('Event History')
        page.drawText('Event History — Continued', { x: 42, y: 704, size: 13, font: bold, color: navy })
        y = 676
      }
      currentDate = dateHeading
      page.drawText(currentDate, { x: 42, y, size: 9.5, font: bold, color: navy })
      y -= 18
    }

    if (y < 96) {
      page = addPage('Event History')
      page.drawText('Event History — Continued', { x: 42, y: 704, size: 13, font: bold, color: navy })
      y = 676
      currentDate = ''
    }

    renderEvent()
  }

  // FINAL PAGE — CRYPTOGRAPHIC INTEGRITY
  page = addPage('Cryptographic Integrity')
  page.drawText('Cryptographic Integrity', { x: 42, y: 704, size: 17, font: bold, color: navy })
  page.drawText('Tamper-evident sealing information for this transaction.', { x: 42, y: 683, size: 8.2, font: regular, color: muted })
  y = 640
  const blocks: Array<[string, string]> = [
    ['Final Signed PDF SHA-256', signedPdfHash],
    ['Event Chain Head', chainHead],
    ['Sealed At', formatAuditTimestamp(sealedAt)],
    ['Envelope ID', publicId],
  ]
  for (const [label, value] of blocks) {
    page.drawText(label.toUpperCase(), { x: 42, y, size: 6.2, font: bold, color: muted })
    page.drawRectangle({ x: 42, y: y - 43, width: 528, height: 34, color: pale, borderColor: line, borderWidth: 0.4 })
    page.drawText(safe(value, 300), { x: 54, y: y - 30, size: 7.3, font: bold, color: navy, maxWidth: 500 })
    y -= 67
  }

  sectionTitle(page, bold, 'Digital Seal', y)
  y -= 18
  const sealRows: Array<[string, string]> = [
    ['Algorithm', context.sealAlgorithm || 'Not recorded'],
    ['Key ID', context.sealKeyId || 'Not recorded'],
    ['Seal Signature', context.sealSignature ? `Base64 (${context.sealSignature.length} chars), prefix ${context.sealSignature.slice(0, 24)}…` : 'Not recorded'],
  ]
  for (const [label, value] of sealRows) {
    page.drawText(label.toUpperCase(), { x: 42, y, size: 6.2, font: bold, color: muted })
    page.drawText(safe(value, 300), { x: 130, y, size: 7.3, font: bold, color: navy, maxWidth: 440 })
    y -= 16
  }
  y -= 8

  sectionTitle(page, bold, 'Integrity Method', y)
  y -= 18
  const integrity = 'Each recorded evidence event is linked to the preceding event using SHA-256. The completed PDF, audit trail, evidence manifest, and final event-chain head are then bound by the Pinnacle Document Integrity System. Any change to a sealed artifact or any insertion, removal, or reordering of events changes the expected cryptographic fingerprints.'
  for (const lineText of wrap(integrity, 108)) {
    page.drawText(lineText, { x: 42, y, size: 7.8, font: regular, color: ink, maxWidth: 528 })
    y -= 12.5
  }

  page.drawRectangle({ x: 42, y: 150, width: 528, height: 112, color: navy })
  page.drawText('OFFICIAL COMPLETION CERTIFICATION', { x: 58, y: 235, size: 7.5, font: bold, color: gold })
  page.drawText('Pinnacle Management Ventures certifies that this electronic record completed the configured', { x: 58, y: 211, size: 7.6, font: regular, color: white, maxWidth: 488 })
  page.drawText('electronic-signature workflow and that the associated evidence artifacts were sealed together', { x: 58, y: 197, size: 7.6, font: regular, color: white, maxWidth: 488 })
  page.drawText('by the Pinnacle Document Integrity System.', { x: 58, y: 183, size: 7.6, font: regular, color: white, maxWidth: 488 })
  page.drawText(`Certificate generated ${formatAuditTimestamp(sealedAt)}`, { x: 58, y: 162, size: 6.4, font: regular, color: rgb(0.78, 0.81, 0.84) })
  page.drawText(`Verification ID: ${safe(context.verificationId || publicId, 90)}`, { x: 58, y: 150, size: 6.4, font: regular, color: gold })

  const legalLines = wrap(legal, 118).slice(0, 5)
  let ly = 123
  for (const lineText of legalLines) {
    page.drawText(lineText, { x: 42, y: ly, size: 6.1, font: regular, color: muted, maxWidth: 528 })
    ly -= 9
  }

  const totalPages = pdf.getPageCount()
  pages.forEach((p, index) => {
    pageChrome(p, regular, bold, logo, index + 1, totalPages, publicId, index === 0 ? 'Audit Summary' : index === totalPages - 1 ? 'Cryptographic Integrity' : 'Event History')
  })

  pdf.setTitle(`Audit Trail - ${publicId}`)
  pdf.setAuthor('Pinnacle Management Ventures')
  pdf.setSubject(`Electronic signature audit evidence for ${docTitle}`)
  pdf.setProducer('Pinnacle Management Ventures Document Integrity System')
  pdf.setKeywords(['Pinnacle Management Ventures', 'audit trail', 'electronic signature', publicId])
  pdf.setCreationDate(new Date(sealedAt))
  const bytes = await pdf.save({ useObjectStreams: true })
  return { bytes, sha256: await sha(bytes), pageCount: pdf.getPageCount(), fontFamily: 'Arial-compatible Helvetica fallback' }
}
