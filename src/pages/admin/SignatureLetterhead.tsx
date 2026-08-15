import { LetterheadCrest } from '../../components/admin/LetterheadCrest'
import {
  FIRM_NAME,
  FIRM_PHONE,
  FIRM_REGION,
  FIRM_SITE_HOST,
  FIRM_TAGLINE,
} from '../../../shared/letterhead'
import { previewSignatureHtml, type EmailSignature } from '../../lib/emailSignatures'

const PHONE = FIRM_PHONE
const SITE = FIRM_SITE_HOST

export function SignatureLetterhead({
  kind,
  personName,
  title,
  email,
  phone,
}: {
  kind: EmailSignature['kind']
  personName?: string | null
  title?: string | null
  email?: string | null
  phone?: string | null
}) {
  const showPerson = kind !== 'company'
  const name = (personName || '').trim() || (kind === 'support' ? 'PMV Support' : '')
  const role = (title || '').trim() || (kind === 'support' ? 'Client Care' : '')
  const mail = (email || '').trim() || (kind === 'support' ? 'support@pinnaclemanagementventures.com' : '')
  const tel = (phone || '').trim()

  return (
    <div className="max-w-[580px] text-[#0a1728]">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-5">
        <LetterheadCrest />
        <div className="min-w-0">
          <p className="font-serif text-[18px] font-semibold leading-[22px] tracking-[.04em]">{FIRM_NAME}</p>
          <p className="mt-1.5 text-[10px] uppercase tracking-[.16em] text-[#5b6573]">{FIRM_TAGLINE}</p>
        </div>
        <div className="hidden shrink-0 text-right text-[11px] leading-[17px] text-[#64748b] sm:block">
          <p>{FIRM_REGION}</p>
          <p>{PHONE}</p>
          <p>{SITE}</p>
        </div>
      </div>
      <div className="mt-3.5 h-px bg-[#c9c3b4]" />
      {showPerson && (name || role || mail) && (
        <div className="mt-4">
          {name && <p className="font-serif text-[15px] leading-5">{name}</p>}
          {role && <p className="mt-1 text-[10px] uppercase tracking-[.14em] text-[#9a7838]">{role}</p>}
          {(tel || mail) && (
            <p className="mt-2 text-[12px] leading-[18px] text-[#334155]">
              {[tel, mail].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function SignaturePreview({
  signature,
  html,
}: {
  signature: EmailSignature
  html?: string
}) {
  return (
    <div
      className="signature-preview"
      dangerouslySetInnerHTML={{ __html: previewSignatureHtml(html ?? signature.html) }}
    />
  )
}
