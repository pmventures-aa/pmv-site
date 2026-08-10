import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Mail, Phone, User, Building2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { AuthLayout, Field, inputCls, ErrorBanner } from './AuthLayout'
import { DocumentUpload, type UploadedDocument } from '../../components/forms/DocumentUpload'

const MIN_PASSWORD = 10

type Step = 'contact' | 'review-contact' | 'services' | 'documents' | 'account'
type DocType = 'government_id' | 'professional_license' | 'insurance' | 'supporting'

interface InviteData {
  invite: {
    id: string
    invite_type: string
    email: string
    full_name: string | null
    status: string
    expires_at: string
    metadata?: { vendor_category?: string; company_name?: string }
  }
}
interface UploadedFile { id:string; document_type:string; file_name:string; size_bytes:number }

const categoryOptions = [
  ['Property & field services', 'Property management, inspections, contractors, trades, repairs, photography, or field work'],
  ['Legal & compliance', 'Attorney, paralegal, process-related, licensing, or compliance work'],
  ['Accounting & financial', 'Accounting, bookkeeping, tax, lending, funding, or financial services'],
  ['Technology & operations', 'POS, payments, implementations, systems, integrations, training, or business operations'],
  ['Mobile & document services', 'Notary, signing, courier, document runner, or other mobile professional work'],
  ['Other professional service', 'A professional specialty that does not fit the categories above'],
] as const

const areaOptions = ['Broward County', 'Palm Beach County', 'Miami-Dade County', 'South Florida / Tri-County', 'Statewide Florida', 'Remote / virtual', 'National / multi-state']

export default function VendorSignup() {
  const [params] = useSearchParams()
  const inviteToken = params.get('invite') || ''
  const [invite, setInvite] = useState<InviteData['invite'] | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken)
  const [step, setStep] = useState<Step>('contact')
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', company_name: '', vendor_category: '', service_area: [] as string[],
    license_status: '' as ''|'yes'|'no'|'unsure', insurance_status: '' as ''|'yes'|'no', notes: '', password: '', confirm: '',
  })
  const [uploadToken, setUploadToken] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState<DocType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [documentWarning, setDocumentWarning] = useState(false)

  useEffect(() => {
    if (!inviteToken) return
    api.get<InviteData>(`/invite/${encodeURIComponent(inviteToken)}`)
      .then((response) => {
        if (response.invite.invite_type !== 'vendor') throw new Error('This is not a provider invitation.')
        setInvite(response.invite)
        const invited = (response.invite.full_name || '').trim().split(/\s+/).filter(Boolean)
        setForm((current) => ({
          ...current,
          first_name: invited[0] || current.first_name,
          last_name: invited.slice(1).join(' ') || current.last_name,
          email: response.invite.email || current.email,
          company_name: response.invite.metadata?.company_name || current.company_name,
          vendor_category: response.invite.metadata?.vendor_category || current.vendor_category,
        }))
        if (response.invite.status !== 'pending') setError(`This invitation is ${response.invite.status}.`)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not load this invitation.'))
      .finally(() => setInviteLoading(false))
  }, [inviteToken])

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) { setForm((current) => ({ ...current, [key]: value })) }
  const steps: Step[] = ['contact', 'review-contact', 'services', 'documents', 'account']
  const stepIndex = steps.indexOf(step)
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100)
  const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim()
  const licenseRequired = form.license_status === 'yes'
  const insuranceRequired = form.insurance_status === 'yes'
  const fileFor = (type: DocType) => files.filter((file) => file.document_type === type)
  const toUploaded = (type: DocType): UploadedDocument[] => fileFor(type).map((file) => ({ id: file.id, name: file.file_name, detail: file.size_bytes ? `${Math.max(1, Math.round(file.size_bytes / 1024))} KB` : undefined }))

  const serviceAreaSummary = useMemo(() => form.service_area.join(', '), [form.service_area])

  function validate(next?: Step) {
    if (step === 'contact') {
      if (!form.first_name.trim()) return 'Enter your first name to continue.'
      if (!form.last_name.trim()) return 'Enter your last name to continue.'
      if (!form.email.includes('@')) return 'Enter a valid email address.'
      if (!form.phone.trim()) return 'Enter a phone number so we can reach you about assignments.'
    }
    if (step === 'services') {
      if (!form.vendor_category) return 'Choose the professional service that best describes your work.'
      if (form.service_area.length === 0) return 'Choose at least one service area.'
      if (!form.license_status) return 'Tell us whether your work requires a professional license.'
      if (!form.insurance_status) return 'Tell us whether you currently carry professional or business insurance.'
    }
    if (step === 'documents' && next === 'account') {
      if (fileFor('government_id').length === 0) return 'Upload a government-issued photo ID to continue.'
      if (licenseRequired && fileFor('professional_license').length === 0) return 'Upload your professional license or credential to continue.'
      if (insuranceRequired && fileFor('insurance').length === 0) return 'Upload current proof of insurance to continue.'
    }
    if (step === 'account') {
      if (form.password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`
      if (form.password !== form.confirm) return 'Passwords do not match.'
    }
    return null
  }

  async function ensureUploadSession() {
    if (uploadToken) return uploadToken
    const response = await api.post<{ token:string }>('/vendor-application/session')
    setUploadToken(response.token)
    return response.token
  }

  async function go(next: Step) {
    setError(null)
    const message = validate(next)
    if (message) return setError(message)
    if (next === 'documents') {
      try { await ensureUploadSession() } catch (err) { return setError(err instanceof ApiError ? err.message : 'Could not start secure document upload.') }
    }
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function upload(type: DocType, picked: File[]) {
    setError(null)
    setUploading(type)
    try {
      const token = await ensureUploadSession()
      for (const file of picked.slice(0, 5)) {
        const response = await api.upload<{ file:UploadedFile }>(`/vendor-application/session/${token}/files/${type}`, file)
        setFiles((current) => [...current, response.file])
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload that document.')
    } finally { setUploading(null) }
  }

  async function remove(fileId: string) {
    if (!uploadToken) return
    try {
      await api.del(`/vendor-application/session/${uploadToken}/files/${fileId}`)
      setFiles((current) => current.filter((file) => file.id !== fileId))
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not remove that document.') }
  }

  async function submit() {
    setError(null)
    const message = validate()
    if (message) return setError(message)
    if (inviteToken && invite?.status !== 'pending') return setError('This invitation is no longer active.')
    setBusy(true)
    try {
      await api.post('/auth/vendor-signup', {
        full_name: fullName,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        company_name: form.company_name || undefined,
        vendor_category: form.vendor_category,
        notes: [
          `Service area: ${serviceAreaSummary}`,
          `Professional license required: ${form.license_status}`,
          `Carries insurance: ${form.insurance_status}`,
          form.notes.trim() ? `Additional notes: ${form.notes.trim()}` : '',
        ].filter(Boolean).join('\n'),
        password: form.password,
      })
      if (uploadToken) {
        try { await api.post(`/vendor-application/session/${uploadToken}/finalize`, { email: form.email }) }
        catch { setDocumentWarning(true) }
      }
      if (inviteToken) await api.post(`/invite/${encodeURIComponent(inviteToken)}/complete-existing`, {}).catch(() => {})
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally { setBusy(false) }
  }

  if (done) return (
    <AuthLayout eyebrow="Pinnacle Professional Network" title="Application received" subtitle="Your provider profile is now in review.">
      <div className="border-l-2 border-gold pl-4 text-sm leading-6 text-slate-300">Pinnacle will review your profile and uploaded qualifications before portal access or client assignments are available.</div>
      {documentWarning && <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">Your profile was received, but one or more documents may not have attached correctly. Pinnacle can request them again during review.</div>}
      <p className="mt-5 text-xs leading-5 text-slate-500">Joining the network does not create an employment relationship or guarantee assignment volume.</p>
      <Link to="../login" className="btn-outline mt-6 inline-block w-full text-center">Back to sign in</Link>
    </AuthLayout>
  )

  return (
    <AuthLayout
      eyebrow={inviteToken ? 'Pinnacle provider invitation' : 'Pinnacle Professional Network'}
      title={step === 'contact' ? 'Start with the basics' : step === 'review-contact' ? 'Confirm your details' : step === 'services' ? 'Tell us what you do' : step === 'documents' ? 'Verify your provider profile' : 'Secure your account'}
      subtitle={step === 'contact' ? 'A few quick details. You can complete the application from your phone or computer.' : step === 'review-contact' ? 'Take a look before we send your verification email.' : step === 'services' ? 'Tap the options that fit. We only ask for documents that apply to your work.' : step === 'documents' ? 'Uploads are private and used to review your provider application.' : 'Last step. Create the password you will use after approval.'}
      footer={<>Already approved? <Link to="../login" className="font-medium text-gold hover:underline">Sign in</Link></>}
    >
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs"><span className="font-medium text-white">Step {stepIndex + 1} of {steps.length}</span><span className="text-gold">{progress}% complete</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress}%` }}/></div>
        {progress >= 75 && <p className="mt-2 text-right text-[11px] text-emerald-300">Almost done</p>}
      </div>

      {inviteLoading && <p className="mb-4 text-sm text-slate-400">Loading your invitation…</p>}
      {inviteToken && invite?.status === 'pending' && <div className="mb-5 rounded-lg border border-gold/20 bg-gold/[0.05] p-3 text-xs text-slate-400">Connected to your private Pinnacle invitation · expires {new Date(invite.expires_at).toLocaleString()}.</div>}
      <ErrorBanner message={error} />

      {step === 'contact' && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><input className={inputCls} autoComplete="given-name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
          <Field label="Last name"><input className={inputCls} autoComplete="family-name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
        </div>
        <Field label="Email"><input className={inputCls} type="email" autoComplete="email" readOnly={!!inviteToken} value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Mobile phone"><input className={inputCls} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Company / practice name (optional)"><input className={inputCls} autoComplete="organization" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} /></Field>
        <button type="button" onClick={() => void go('review-contact')} className="btn-gold w-full">Continue</button>
      </div>}

      {step === 'review-contact' && <div className="space-y-4">
        <div className="rounded-lg border border-gold/20 bg-gold/[.03] p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gold">
            <CheckCircle2 size={14} /> Ready to send verification
          </div>
          <ul className="divide-y divide-white/5 text-sm">
            <SummaryRow icon={<User size={14} />} label="Name" value={fullName} />
            <SummaryRow icon={<Mail size={14} />} label="Email" value={form.email} />
            <SummaryRow icon={<Phone size={14} />} label="Phone" value={form.phone} />
            {form.company_name.trim() && <SummaryRow icon={<Building2 size={14} />} label="Company" value={form.company_name} />}
          </ul>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Continue and we'll send a verification email to <strong className="text-slate-300">{form.email}</strong> after your application is submitted. If anything looks wrong, go back and edit before continuing.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep('contact')} className="btn-outline flex-1">Back &amp; edit</button>
          <button type="button" onClick={() => void go('services')} className="btn-gold flex-[1.5]">Looks good — continue</button>
        </div>
      </div>}

      {step === 'services' && <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">What best describes your work?</p>
        <div className="divide-y divide-white/10 border-y border-white/10">{categoryOptions.map(([title, body]) => <button key={title} type="button" onClick={() => set('vendor_category', title)} className={`w-full px-2 py-3.5 text-left transition ${form.vendor_category === title ? 'bg-gold/[.07]' : 'hover:bg-white/[.025]'}`}><span className="flex items-center gap-3"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${form.vendor_category === title ? 'border-gold bg-gold text-navy-950' : 'border-white/20'}`}>{form.vendor_category === title ? '✓' : ''}</span><span><span className="block text-sm font-medium text-white">{title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{body}</span></span></span></button>)}</div>

        <p className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-slate-500">Where can you accept assignments?</p>
        <div className="flex flex-wrap gap-2">{areaOptions.map((area) => { const selected = form.service_area.includes(area); return <button key={area} type="button" onClick={() => set('service_area', selected ? form.service_area.filter((value) => value !== area) : [...form.service_area, area])} className={`rounded-md border px-3 py-2 text-xs ${selected ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-400 hover:border-white/25'}`}>{selected ? '✓ ' : ''}{area}</button> })}</div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Choice label="Does your work require a professional license or credential?" value={form.license_status} options={[['yes','Yes'],['no','No'],['unsure','Not sure']]} onChange={(value) => set('license_status', value as typeof form.license_status)} />
          <Choice label="Do you currently carry business or professional insurance?" value={form.insurance_status} options={[['yes','Yes'],['no','No']]} onChange={(value) => set('insurance_status', value as typeof form.insurance_status)} />
        </div>
        <div className="mt-5"><Field label="Anything else we should know? (optional)"><textarea className={`${inputCls} min-h-20`} placeholder="Specialty, years of experience, availability, certifications, languages, etc." value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field></div>
        <div className="mt-6 flex gap-2"><button type="button" onClick={() => setStep('review-contact')} className="btn-outline flex-1">Back</button><button type="button" onClick={() => void go('documents')} className="btn-gold flex-[1.5]">Continue</button></div>
      </div>}

      {step === 'documents' && <div className="space-y-6">
        <DocumentUpload label="Government-issued photo ID" help="Required for provider vetting. A driver's license, state ID, or passport is acceptable. Take a clear photo or upload a PDF/image." required files={toUploaded('government_id')} uploading={uploading === 'government_id'} onFiles={(picked) => upload('government_id', picked)} onRemove={remove}/>
        {licenseRequired && <DocumentUpload label="Professional license or credential" help="Required because you told us your work requires licensing or a professional credential." required files={toUploaded('professional_license')} uploading={uploading === 'professional_license'} onFiles={(picked) => upload('professional_license', picked)} onRemove={remove}/>} 
        {insuranceRequired && <DocumentUpload label="Proof of insurance" help="Upload a current certificate, declarations page, or other proof of applicable business/professional coverage." required files={toUploaded('insurance')} uploading={uploading === 'insurance'} onFiles={(picked) => upload('insurance', picked)} onRemove={remove}/>} 
        <DocumentUpload label="Other supporting document" help="Optional. Add a certification, work sample, W-9, reference document, or other file that helps us review your fit." multiple files={toUploaded('supporting')} uploading={uploading === 'supporting'} onFiles={(picked) => upload('supporting', picked)} onRemove={remove}/>
        <div className="flex gap-2"><button type="button" onClick={() => setStep('services')} className="btn-outline flex-1">Back</button><button type="button" onClick={() => void go('account')} className="btn-gold flex-[1.5]">Continue</button></div>
      </div>}

      {step === 'account' && <div className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/[.02] p-4 text-xs leading-5 text-slate-400"><strong className="text-white">Review:</strong> {form.vendor_category} · {serviceAreaSummary}. {files.length} document{files.length === 1 ? '' : 's'} attached.</div>
        <Field label={`Password (at least ${MIN_PASSWORD} characters)`}><input className={inputCls} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
        <Field label="Confirm password"><input className={inputCls} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} /></Field>
        <p className="text-xs leading-5 text-slate-500">Submitting starts Pinnacle's provider review. It does not create employment or guarantee assignments.</p>
        <div className="flex gap-2"><button type="button" onClick={() => setStep('documents')} className="btn-outline flex-1">Back</button><button type="button" disabled={busy || inviteLoading || (!!inviteToken && invite?.status !== 'pending')} onClick={() => void submit()} className="btn-gold flex-[1.5] disabled:opacity-60">{busy ? 'Submitting…' : 'Submit application'}</button></div>
      </div>}
    </AuthLayout>
  )
}

function Choice({ label, value, options, onChange }: { label:string; value:string; options:readonly (readonly [string,string])[]; onChange:(value:string)=>void }) {
  return <div><p className="mb-2 text-xs leading-5 text-slate-400">{label}</p><div className="flex flex-wrap gap-2">{options.map(([key,text]) => <button key={key} type="button" onClick={() => onChange(key)} className={`rounded-md border px-3 py-2 text-xs ${value === key ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-400 hover:border-white/25'}`}>{value === key ? '✓ ' : ''}{text}</button>)}</div></div>
}

// One line inside the pre-submission summary card. Renders a small icon,
// the label, and the value the applicant just typed — a static visual
// confirmation so they can catch typos before triggering the verification
// email that starts the review clock.
function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-white">{value}</p>
      </div>
    </li>
  )
}
