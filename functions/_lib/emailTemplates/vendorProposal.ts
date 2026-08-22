import { renderPinnacleEmailLayout } from './layout'
import { escapeHtml } from '../email'
import { formatCents, proposalKindLabel, type ProposalLine } from '../../../shared/vendorProposals'

export interface VendorProposalEmailInput {
  proposal: {
    id: string
    kind: string
    title: string | null
    summary: string | null
    site_label: string | null
    site_address: string | null
    site_city: string | null
    site_state: string | null
    site_postal_code: string | null
    scheduled_at: string | null
    respond_by: string | null
    offer_notes: string | null
  }
  lines: ProposalLine[]
  totalCents: number
  vendorName: string | null
  reviewUrl: string
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

function siteLine(p: VendorProposalEmailInput['proposal']): string | null {
  const cityState = [p.site_city, p.site_state].filter(Boolean).join(', ')
  const parts = [p.site_address, cityState, p.site_postal_code].filter(Boolean)
  if (!parts.length) return p.site_label || null
  return [p.site_label, parts.join(' ')].filter(Boolean).join(' - ')
}

function factRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#6f7784;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#1b2735;vertical-align:top">${escapeHtml(value)}</td>
  </tr>`
}

/**
 * The offer a provider reads before deciding. Everything that changes what they
 * are agreeing to - scope, place, time, money, and the respond-by date - is in
 * the body, so accepting from the app is a confirmation of what they already
 * read rather than a click into an unknown.
 */
export function renderVendorProposalEmail(input: VendorProposalEmailInput): { subject: string; html: string; text: string } {
  const { proposal, lines, totalCents, reviewUrl } = input
  const title = proposal.title?.trim() || proposalKindLabel(proposal.kind)
  const greeting = input.vendorName?.trim() ? `Hello ${input.vendorName.trim()},` : 'Hello,'

  const facts: string[] = []
  facts.push(factRow('Type', proposalKindLabel(proposal.kind)))
  const site = siteLine(proposal)
  if (site) facts.push(factRow(proposal.kind === 'ron' ? 'Session' : 'Location', site))
  const when = formatDate(proposal.scheduled_at)
  if (when) facts.push(factRow('Scheduled', when))
  const respondBy = formatDate(proposal.respond_by)
  if (respondBy) facts.push(factRow('Respond by', respondBy))
  facts.push(factRow('Offered', formatCents(totalCents)))

  const scopeHtml = proposal.summary?.trim()
    ? `<h3 style="margin:26px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#293546">Scope of work</h3>
       <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#3a4757;white-space:pre-line">${escapeHtml(proposal.summary.trim())}</p>`
    : ''

  const itemsHtml = lines.length
    ? `<h3 style="margin:26px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#293546">Itemized</h3>
       <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
         ${lines.map((line) => {
           const qty = line.quantity ? `${line.quantity}${line.unit ? ` ${line.unit}` : ''}` : ''
           const detail = [qty, line.detail].filter(Boolean).join(' - ')
           return `<tr>
             <td style="padding:7px 12px 7px 0;border-bottom:1px solid #eef1f5;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#1b2735">
               ${escapeHtml(line.label)}${detail ? `<br><span style="font-size:12px;line-height:18px;color:#6f7784">${escapeHtml(detail)}</span>` : ''}
             </td>
             <td align="right" style="padding:7px 0;border-bottom:1px solid #eef1f5;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#1b2735;white-space:nowrap;vertical-align:top">${escapeHtml(formatCents(line.amount_cents))}</td>
           </tr>`
         }).join('')}
         <tr>
           <td style="padding:10px 12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#293546;font-weight:700">Total offered</td>
           <td align="right" style="padding:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#293546;font-weight:700;white-space:nowrap">${escapeHtml(formatCents(totalCents))}</td>
         </tr>
       </table>`
    : ''

  const notesHtml = proposal.offer_notes?.trim()
    ? `<p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#6f7784">${escapeHtml(proposal.offer_notes.trim())}</p>`
    : ''

  const bodyHtml = `
    <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#3a4757">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#3a4757">We have work available and would like to offer it to you. The details are below. Review them and let us know whether you can take it.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top:1px solid #eef1f5;border-bottom:1px solid #eef1f5">${facts.join('')}</table>
    ${scopeHtml}
    ${itemsHtml}
    ${notesHtml}
    <p style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#6f7784">Accepting confirms you can perform this work on the terms above. Our team then confirms the assignment before it becomes scheduled work, and you will get a separate notice when that happens.</p>
  `

  const textLines = [
    greeting,
    '',
    'We have work available and would like to offer it to you.',
    '',
    `Type: ${proposalKindLabel(proposal.kind)}`,
    site ? `${proposal.kind === 'ron' ? 'Session' : 'Location'}: ${site}` : '',
    when ? `Scheduled: ${when}` : '',
    respondBy ? `Respond by: ${respondBy}` : '',
    `Offered: ${formatCents(totalCents)}`,
    '',
    proposal.summary?.trim() ? `Scope of work:\n${proposal.summary.trim()}\n` : '',
    ...lines.map((line) => `- ${line.label}: ${formatCents(line.amount_cents)}`),
    lines.length ? `Total offered: ${formatCents(totalCents)}` : '',
    proposal.offer_notes?.trim() ? `\n${proposal.offer_notes.trim()}` : '',
    '',
    `Review and respond: ${reviewUrl}`,
  ].filter((line) => line !== '')

  return {
    subject: `Work offer: ${title}`,
    html: renderPinnacleEmailLayout({
      preheader: `${proposalKindLabel(proposal.kind)} offered at ${formatCents(totalCents)}`,
      eyebrow: 'Provider network',
      title: `Work offer: ${title}`,
      bodyHtml,
      cta: { label: 'Review and respond', url: reviewUrl },
    }),
    text: textLines.join('\n'),
  }
}
