import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Building2, CheckCircle2, Mail, Phone, ShieldCheck, User } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { AuthLayout, ErrorBanner, Field, inputCls } from './AuthLayout'
import { DocumentUpload, type UploadedDocument } from '../../components/forms/DocumentUpload'
import { PROVIDER_AGREEMENT_URL, PROVIDER_AGREEMENT_VERSION, normalizeProviderSignature } from '../../../shared/providerAgreement'

const MIN_PASSWORD = 10

type Step = 'contact' | 'services' | 'questions' | 'documents' | 'account'
type DocType = 'government_id_front' | 'government_id_back' | 'ein_letter' | 'professional_license' | 'insurance' | 'w9' | 'supporting'

type EnrollmentKey = 'property_field' | 'mobile_notary' | 'ron' | 'document_courier' | 'merchant_technology' | 'business_operations' | 'bookkeeping_financial' | 'other'

interface InviteData {
  invite: {
    id: string
    invite_type: string
    email: string
    full_name: string | null
    status: string
    expires_at: string
    metadata?: { vendor_category?: string; company_name?: string; known_services?: string[]; recipient_context?: string }
  }
}
interface UploadedFile { id:string; document_type:string; file_name:string; size_bytes:number }

const enrollments: { key:EnrollmentKey; title:string; body:string }[] = [
  { key:'property_field', title:'Property & Field Services', body:'Property management support, inspections, contractors, repairs, photography, turns, or on-site work.' },
  { key:'mobile_notary', title:'Mobile Notary / Signing', body:'Mobile notarization, signing appointments, witness services, or document execution support.' },
  { key:'ron', title:'Remote Online Notary (RON)', body:'Online notarization or remote signing services.' },
  { key:'document_courier', title:'Document Courier / Mobile Support', body:'Courier, filing, document runner, pickup/drop-off, or other mobile professional services.' },
  { key:'merchant_technology', title:'Merchant / POS Technology', body:'Payments, POS, gateway, implementation, migration, integrations, deployment, or training.' },
  { key:'business_operations', title:'Business Operations / Consulting', body:'Administrative support, project coordination, systems, vendor management, consulting, or implementation.' },
  { key:'bookkeeping_financial', title:'Bookkeeping / Financial Support', body:'Bookkeeping, accounting support, tax preparation support, lending, funding, or financial services.' },
  { key:'other', title:'Other Professional Service', body:'Another professional specialty Pinnacle may coordinate for clients.' },
]

const areaOptions = ['Broward County', 'Palm Beach County', 'Miami-Dade County', 'South Florida / Tri-County', 'Statewide Florida', 'Remote / virtual', 'National / multi-state']

export default function VendorSignup() {
  const [params] = useSearchParams()
  const inviteToken = params.get('invite') || ''
  const [invite, setInvite] = useState<InviteData['invite'] | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken)
  const [step, setStep] = useState<Step>('contact')
  const [form, setForm] = useState({
    first_name:'', last_name:'', email:'', phone:'', company_name:'', entity_type:'', has_ein:'' as ''|'yes'|'no',
    enrollments:[] as EnrollmentKey[], service_area:[] as string[], years_experience:'', travel_radius:'',
    commission_state:'Florida', commission_number:'', commission_expiration:'', ron_provider:'',
    license_status:'' as ''|'yes'|'no'|'unsure', insurance_status:'' as ''|'yes'|'no',
    technology_platforms:'', accounting_credentials:'', other_service:'', notes:'', password:'', confirm:'',
    provider_agreement_accepted:false, signature_name:'',
  })
  const [uploadToken, setUploadToken] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState<DocType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [documentWarning, setDocumentWarning] = useState(false)
  const [agreementVersion, setAgreementVersion] = useState(PROVIDER_AGREEMENT_VERSION)

  useEffect(() => {
    api.get<{ template: { version_label?: string } }>('/managed-templates/provider-agreement')
      .then((response) => { if (response.template?.version_label) setAgreementVersion(response.template.version_label) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!inviteToken) return
    api.get<InviteData>(`/invite/${encodeURIComponent(inviteToken)}`)
      .then((response) => {
        if (response.invite.invite_type !== 'vendor') throw new Error('This is not a provider invitation.')
        setInvite(response.invite)
        const invited = (response.invite.full_name || '').trim().split(/\s+/).filter(Boolean)
        const knownServices = Array.isArray(response.invite.metadata?.known_services)
          ? response.invite.metadata.known_services.filter((key): key is EnrollmentKey => enrollments.some((item) => item.key === key))
          : []
        setForm((current) => ({
          ...current,
          first_name: invited[0] || current.first_name,
          last_name: invited.slice(1).join(' ') || current.last_name,
          email: response.invite.email || current.email,
          company_name: response.invite.metadata?.company_name || current.company_name,
          enrollments: knownServices.length ? knownServices : current.enrollments,
        }))
        if (response.invite.status !== 'pending') setError(`This invitation is ${response.invite.status}.`)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not load this invitation.'))
      .finally(() => setInviteLoading(false))
  }, [inviteToken])

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) { setForm((current) => ({ ...current, [key]: value })) }
  const steps: Step[] = ['contact', 'services', 'questions', 'documents', 'account']
  const stepIndex = steps.indexOf(step)
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100)
  const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim()
  const selectedTitles = useMemo(() => form.enrollments.map((key) => enrollments.find((item) => item.key === key)?.title || key), [form.enrollments])
  const notarySelected = form.enrollments.includes('mobile_notary') || form.enrollments.includes('ron')
  const ronSelected = form.enrollments.includes('ron')
  const propertySelected = form.enrollments.includes('property_field') || form.enrollments.includes('document_courier')
  const techSelected = form.enrollments.includes('merchant_technology')
  const financeSelected = form.enrollments.includes('bookkeeping_financial')
  const businessEntity = form.entity_type !== 'Individual / Sole Proprietor' || form.has_ein === 'yes'
  const licenseRequired = notarySelected || form.license_status === 'yes'
  const insuranceRequired = propertySelected || notarySelected || form.insurance_status === 'yes'
  const fileFor = (type: DocType) => files.filter((file) => file.document_type === type)
  const toUploaded = (type: DocType): UploadedDocument[] => fileFor(type).map((file) => ({ id:file.id, name:file.file_name, detail:file.size_bytes ? `${Math.max(1, Math.round(file.size_bytes / 1024))} KB` : undefined }))

  function toggleEnrollment(key: EnrollmentKey) {
    set('enrollments', form.enrollments.includes(key) ? form.enrollments.filter((item) => item !== key) : [...form.enrollments, key])
  }

  function validate(next?: Step) {
    if (step === 'contact') {
      if (!form.first_name.trim() || !form.last_name.trim()) return 'Enter your first and last name to continue.'
      if (!form.email.includes('@')) return 'Enter a valid email address.'
      if (!form.phone.trim()) return 'Enter a mobile phone number.'
      if (!form.entity_type) return 'Choose how you operate your business.'
      if (!form.has_ein) return 'Tell us whether you use an EIN.'
      if (businessEntity && !form.company_name.trim()) return 'Enter your business or practice name.'
    }
    if (step === 'services') {
      if (form.enrollments.length === 0) return 'Choose at least one service you want to enroll for.'
      if (form.service_area.length === 0) return 'Choose at least one service area.'
    }
    if (step === 'questions') {
      if (!form.years_experience.trim()) return 'Enter your approximate years of experience.'
      if (!form.license_status) return 'Tell us whether your work requires a license or credential.'
      if (!form.insurance_status) return 'Tell us whether you carry business or professional insurance.'
      if (notarySelected && (!form.commission_number.trim() || !form.commission_expiration)) return 'Enter your notary commission number and expiration date.'
      if (ronSelected && !form.ron_provider.trim()) return 'Tell us which RON platform/provider you use or plan to use.'
      if (propertySelected && !form.travel_radius.trim()) return 'Enter your typical travel radius for field assignments.'
      if (techSelected && !form.technology_platforms.trim()) return 'List the POS, payment, gateway, or business systems you have experience with.'
      if (financeSelected && !form.accounting_credentials.trim()) return 'Describe your bookkeeping/accounting experience or credentials.'
      if (form.enrollments.includes('other') && !form.other_service.trim()) return 'Describe the other professional service you provide.'
    }
    if (step === 'documents' && next === 'account') {
      if (fileFor('government_id_front').length === 0) return 'Upload the front of your government-issued ID.'
      if (fileFor('government_id_back').length === 0) return 'Upload the back of your government-issued ID.'
      if (businessEntity && fileFor('ein_letter').length === 0) return 'Upload your IRS EIN confirmation letter.'
      if (licenseRequired && fileFor('professional_license').length === 0) return 'Upload your applicable professional license or credential.'
      if (insuranceRequired && fileFor('insurance').length === 0) return 'Upload current proof of insurance.'
    }
    if (step === 'account') {
      if (form.password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`
      if (form.password !== form.confirm) return 'Passwords do not match.'
      if (!form.provider_agreement_accepted) return 'Review and accept the Independent Provider Network Agreement.'
      if (normalizeProviderSignature(form.signature_name) !== normalizeProviderSignature(fullName)) return 'Type your full legal name exactly as entered above to sign the Provider Agreement.'
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
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  async function upload(type: DocType, picked: File[]) {
    setError(null); setUploading(type)
    try {
      const token = await ensureUploadSession()
      for (const file of picked.slice(0, 5)) {
        const response = await api.upload<{ file:UploadedFile }>(`/vendor-application/session/${token}/files/${type}`, file)
        setFiles((current) => [...current, response.file])
      }
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not upload that document.') }
    finally { setUploading(null) }
  }

  async function remove(fileId:string) {
    if (!uploadToken) return
    try { await api.del(`/vendor-application/session/${uploadToken}/files/${fileId}`); setFiles((current) => current.filter((file) => file.id !== fileId)) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not remove that document.') }
  }

  const applicationData = {
    entity_type:form.entity_type,
    has_ein:form.has_ein,
    company_name:form.company_name || null,
    enrollments:selectedTitles,
    service_area:form.service_area,
    years_experience:form.years_experience,
    travel_radius:form.travel_radius || null,
    license_status:form.license_status,
    insurance_status:form.insurance_status,
    commission_state:notarySelected ? form.commission_state : null,
    commission_number:notarySelected ? form.commission_number : null,
    commission_expiration:notarySelected ? form.commission_expiration : null,
    ron_provider:ronSelected ? form.ron_provider : null,
    technology_platforms:techSelected ? form.technology_platforms : null,
    accounting_credentials:financeSelected ? form.accounting_credentials : null,
    other_service:form.enrollments.includes('other') ? form.other_service : null,
    notes:form.notes || null,
  }

  async function submit() {
    setError(null)
    const message = validate()
    if (message) return setError(message)
    if (inviteToken && invite?.status !== 'pending') return setError('This invitation is no longer active.')
    setBusy(true)
    try {
      await api.post('/auth/vendor-signup', {
        full_name:fullName,
        email:form.email,
        phone:form.phone,
        company_name:form.company_name || undefined,
        vendor_category:selectedTitles.join(', '),
        notes:`Enrollments: ${selectedTitles.join(', ')}\nService area: ${form.service_area.join(', ')}\nEntity: ${form.entity_type}\nYears experience: ${form.years_experience}${form.notes ? `\nNotes: ${form.notes}` : ''}`,
        password:form.password,
        provider_agreement_version:agreementVersion,
        provider_agreement_accepted:form.provider_agreement_accepted,
        provider_signature_name:form.signature_name,
      })
      if (uploadToken) {
        try { await api.post(`/vendor-application/session/${uploadToken}/finalize`, { email:form.email, application_data:applicationData }) }
        catch { setDocumentWarning(true) }
      }
      if (inviteToken) await api.post(`/invite/${encodeURIComponent(inviteToken)}/complete-existing`, {}).catch(() => {})
      setDone(true)
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }

  if (done) return (
    <AuthLayout eyebrow="Pinnacle Professional Network" title="Application received" subtitle="Your provider profile is now in review.">
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.05] p-4 text-sm leading-6 text-slate-300"><div className="mb-2 flex items-center gap-2 font-semibold text-emerald-300"><ShieldCheck size={16}/> Secure application submitted</div>Pinnacle will review your enrollment answers, identity documents, and qualifications before access or assignments are enabled.</div>
      {documentWarning && <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">Your profile was received, but one or more documents may not have attached correctly. Pinnacle can request them again during review.</div>}
      <Link to="../login" className="btn-outline mt-6 inline-block w-full text-center">Back to sign in</Link>
    </AuthLayout>
  )

  return (
    <AuthLayout eyebrow={inviteToken ? 'Private Pinnacle provider invitation' : 'Pinnacle Professional Network'} title={step === 'contact' ? 'Provider application' : step === 'services' ? 'What are you enrolling for?' : step === 'questions' ? 'Professional details' : step === 'documents' ? 'Identity & business verification' : 'Secure your account'} subtitle={step === 'contact' ? 'Start with your contact and business identity.' : step === 'services' ? 'Choose every service category you may accept assignments for. Your next questions and requirements adjust automatically.' : step === 'questions' ? 'We only ask the questions that apply to the services you selected.' : step === 'documents' ? 'Upload verification documents through Pinnacle’s private document intake.' : 'Create the password you will use after approval.'} footer={<>Already approved? <Link to="../login" className="font-medium text-gold hover:underline">Sign in</Link></>}>
      <div className="mb-6"><div className="flex items-center justify-between text-xs"><span className="font-medium text-white">Step {stepIndex + 1} of {steps.length}</span><span className="text-gold">{progress}% complete</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold transition-all" style={{ width:`${progress}%` }}/></div></div>
      {inviteLoading && <p className="mb-4 text-sm text-slate-400">Loading your invitation…</p>}
      {inviteToken && invite?.status === 'pending' && <div className="mb-5 rounded-lg border border-gold/20 bg-gold/[.05] p-3 text-xs leading-5 text-slate-400"><span className="font-semibold text-gold">Private invitation verified</span> · expires {new Date(invite.expires_at).toLocaleString()}. You can apply as an individual or register your business, and you may change or add services before submitting.</div>}
      <ErrorBanner message={error}/>

      {step === 'contact' && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><Field label="First name"><input className={inputCls} value={form.first_name} onChange={(e)=>set('first_name',e.target.value)}/></Field><Field label="Last name"><input className={inputCls} value={form.last_name} onChange={(e)=>set('last_name',e.target.value)}/></Field></div>
        <Field label="Email"><input className={inputCls} type="email" readOnly={!!inviteToken} value={form.email} onChange={(e)=>set('email',e.target.value)}/></Field>
        <Field label="Mobile phone"><input className={inputCls} type="tel" value={form.phone} onChange={(e)=>set('phone',e.target.value)}/></Field>
        <Field label="How do you operate?"><select className={inputCls} value={form.entity_type} onChange={(e)=>set('entity_type',e.target.value)}><option value="">Select entity type</option><option>Individual / Sole Proprietor</option><option>LLC</option><option>Corporation</option><option>Partnership</option><option>Nonprofit</option><option>Other</option></select></Field>
        <Choice label="Do you use an EIN for this business?" value={form.has_ein} options={[['yes','Yes'],['no','No']]} onChange={(value)=>set('has_ein',value as typeof form.has_ein)}/>
        <Field label={businessEntity ? 'Business / practice legal name' : 'Business / practice name (optional)'}><input className={inputCls} value={form.company_name} onChange={(e)=>set('company_name',e.target.value)}/></Field>
        <button type="button" onClick={()=>void go('services')} className="btn-gold w-full">Continue</button>
      </div>}

      {step === 'services' && <div className="space-y-5">
        <div className="grid gap-2">{enrollments.map((item)=>{const selected=form.enrollments.includes(item.key);return <button key={item.key} type="button" onClick={()=>toggleEnrollment(item.key)} className={`rounded-xl border p-4 text-left transition ${selected?'border-gold/40 bg-gold/[.06]':'border-white/[.09] bg-white/[.015] hover:border-white/20'}`}><span className="flex gap-3"><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-xs ${selected?'border-gold bg-gold text-navy-950':'border-white/20'}`}>{selected?'✓':''}</span><span><span className="block text-sm font-semibold text-white">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.body}</span></span></span></button>})}</div>
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Where can you accept assignments?</p><div className="flex flex-wrap gap-2">{areaOptions.map((area)=>{const selected=form.service_area.includes(area);return <button key={area} type="button" onClick={()=>set('service_area',selected?form.service_area.filter((x)=>x!==area):[...form.service_area,area])} className={`rounded-lg border px-3 py-2 text-xs ${selected?'border-gold/40 bg-gold/[.06] text-gold':'border-white/10 text-slate-400'}`}>{selected?'✓ ':''}{area}</button>})}</div></div>
        <div className="flex gap-2"><button onClick={()=>setStep('contact')} className="btn-outline flex-1">Back</button><button onClick={()=>void go('questions')} className="btn-gold flex-[1.5]">Continue</button></div>
      </div>}

      {step === 'questions' && <div className="space-y-5">
        <Field label="Years of relevant experience"><input className={inputCls} inputMode="numeric" placeholder="Example: 5" value={form.years_experience} onChange={(e)=>set('years_experience',e.target.value)}/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Choice label="Does any selected work require a professional license or credential?" value={form.license_status} options={[['yes','Yes'],['no','No'],['unsure','Unsure']]} onChange={(value)=>set('license_status',value as typeof form.license_status)}/><Choice label="Do you carry business/professional insurance?" value={form.insurance_status} options={[['yes','Yes'],['no','No']]} onChange={(value)=>set('insurance_status',value as typeof form.insurance_status)}/></div>
        {propertySelected && <Field label="Typical travel radius for field assignments"><input className={inputCls} placeholder="Example: 35 miles / Tri-County" value={form.travel_radius} onChange={(e)=>set('travel_radius',e.target.value)}/></Field>}
        {notarySelected && <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4"><p className="mb-4 text-sm font-semibold text-white">Notary commission</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Commission state"><input className={inputCls} value={form.commission_state} onChange={(e)=>set('commission_state',e.target.value)}/></Field><Field label="Commission number"><input className={inputCls} value={form.commission_number} onChange={(e)=>set('commission_number',e.target.value)}/></Field><Field label="Commission expiration"><input className={inputCls} type="date" value={form.commission_expiration} onChange={(e)=>set('commission_expiration',e.target.value)}/></Field>{ronSelected && <Field label="RON platform / provider"><input className={inputCls} placeholder="Example: Proof, Notarize, BlueNotary" value={form.ron_provider} onChange={(e)=>set('ron_provider',e.target.value)}/></Field>}</div></div>}
        {techSelected && <Field label="POS, payment, gateway, CRM, or business systems you know"><textarea className={`${inputCls} min-h-24`} value={form.technology_platforms} onChange={(e)=>set('technology_platforms',e.target.value)}/></Field>}
        {financeSelected && <Field label="Bookkeeping/accounting experience or credentials"><textarea className={`${inputCls} min-h-24`} value={form.accounting_credentials} onChange={(e)=>set('accounting_credentials',e.target.value)}/></Field>}
        {form.enrollments.includes('other') && <Field label="Describe your other professional service"><textarea className={`${inputCls} min-h-20`} value={form.other_service} onChange={(e)=>set('other_service',e.target.value)}/></Field>}
        <Field label="Additional notes (optional)"><textarea className={`${inputCls} min-h-20`} value={form.notes} onChange={(e)=>set('notes',e.target.value)}/></Field>
        <div className="flex gap-2"><button onClick={()=>setStep('services')} className="btn-outline flex-1">Back</button><button onClick={()=>void go('documents')} className="btn-gold flex-[1.5]">Continue</button></div>
      </div>}

      {step === 'documents' && <div className="space-y-4">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.04] p-4"><div className="flex gap-3"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-emerald-300"/><div><p className="text-sm font-semibold text-white">Private verification workspace</p><p className="mt-1 text-xs leading-5 text-slate-500">Identity and tax documents are stored separately from your public/provider profile and are only available to authorized reviewers.</p></div></div></div>
        <DocumentUpload label="Government ID: Front" help="Required. Upload a clear image of the front of your driver license, state ID, or other government-issued photo ID." required files={toUploaded('government_id_front')} uploading={uploading==='government_id_front'} onFiles={(picked)=>upload('government_id_front',picked)} onRemove={remove}/>
        <DocumentUpload label="Government ID: Back" help="Required. Upload a clear image of the back of the same ID." required files={toUploaded('government_id_back')} uploading={uploading==='government_id_back'} onFiles={(picked)=>upload('government_id_back',picked)} onRemove={remove}/>
        {businessEntity && <DocumentUpload label="IRS EIN Letter" help="Required for business entities/EIN users. Upload your CP 575, 147C, SS-4 confirmation, or other IRS-issued EIN confirmation." required files={toUploaded('ein_letter')} uploading={uploading==='ein_letter'} onFiles={(picked)=>upload('ein_letter',picked)} onRemove={remove}/>}
        {licenseRequired && <DocumentUpload label={notarySelected?'Professional license / Notary commission':'Professional license or credential'} help="Required based on the services and licensing answers in your application." required files={toUploaded('professional_license')} uploading={uploading==='professional_license'} onFiles={(picked)=>upload('professional_license',picked)} onRemove={remove}/>} 
        {insuranceRequired && <DocumentUpload label="Proof of insurance" help="Required based on the services you selected. Upload a current certificate, declarations page, E&O policy, or other applicable coverage proof." required files={toUploaded('insurance')} uploading={uploading==='insurance'} onFiles={(picked)=>upload('insurance',picked)} onRemove={remove}/>} 
        <DocumentUpload label="W-9 (optional now)" help="You can provide a current W-9 during onboarding now or Pinnacle can request it before a paid assignment." files={toUploaded('w9')} uploading={uploading==='w9'} onFiles={(picked)=>upload('w9',picked)} onRemove={remove}/>
        <DocumentUpload label="Other supporting documents" help="Optional certifications, references, work samples, or supporting credentials." multiple files={toUploaded('supporting')} uploading={uploading==='supporting'} onFiles={(picked)=>upload('supporting',picked)} onRemove={remove}/>
        <div className="flex gap-2"><button onClick={()=>setStep('questions')} className="btn-outline flex-1">Back</button><button onClick={()=>void go('account')} className="btn-gold flex-[1.5]">Continue</button></div>
      </div>}

      {step === 'account' && <div className="space-y-4">
        <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application summary</p><p className="mt-2 text-sm text-white">{selectedTitles.join(' · ')}</p><p className="mt-1 text-xs text-slate-500">{form.service_area.join(', ')} · {files.length} secure document{files.length===1?'':'s'} attached</p></div>
        <Field label={`Password (at least ${MIN_PASSWORD} characters)`}><input className={inputCls} type="password" value={form.password} onChange={(e)=>set('password',e.target.value)}/></Field><Field label="Confirm password"><input className={inputCls} type="password" value={form.confirm} onChange={(e)=>set('confirm',e.target.value)}/></Field>
        <div className="rounded-xl border border-gold/20 bg-gold/[.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-gold">Provider relationship</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">The agreement covers your participation in Pinnacle's network. Every accepted assignment will still have its own scope, timing, compensation, access instructions, and deliverables.</p>
          <a href={PROVIDER_AGREEMENT_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-gold hover:text-gold-300">Read the Independent Provider Network Agreement →</a>
          <label className="mt-4 flex items-start gap-3 border-t border-white/[.08] pt-4 text-xs leading-5 text-slate-300"><input type="checkbox" checked={form.provider_agreement_accepted} onChange={(e)=>set('provider_agreement_accepted',e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-gold"/><span>I have reviewed and agree to the Independent Provider Network Agreement dated {agreementVersion}, and I consent to electronic records and signatures for my provider application and assignments.</span></label>
          <div className="mt-4"><Field label="Electronic signature: Type your full legal name"><input className={inputCls} autoComplete="name" placeholder={fullName || 'Your full legal name'} value={form.signature_name} onChange={(e)=>set('signature_name',e.target.value)}/></Field></div>
        </div>
        <p className="text-xs leading-5 text-slate-500">Submitting starts Pinnacle's provider review. Access remains pending until a Pinnacle administrator approves the application. Your acceptance time and security record are retained with your application.</p>
        <div className="flex gap-2"><button onClick={()=>setStep('documents')} className="btn-outline flex-1">Back</button><button disabled={busy||inviteLoading|| (!!inviteToken && invite?.status!=='pending')} onClick={()=>void submit()} className="btn-gold flex-[1.5] disabled:opacity-60">{busy?'Submitting securely…':'Submit application'}</button></div>
      </div>}
    </AuthLayout>
  )
}

function Choice({ label,value,options,onChange }:{ label:string; value:string; options:readonly (readonly [string,string])[]; onChange:(value:string)=>void }) {
  return <div><p className="mb-2 text-xs leading-5 text-slate-400">{label}</p><div className="flex flex-wrap gap-2">{options.map(([key,text])=><button key={key} type="button" onClick={()=>onChange(key)} className={`rounded-lg border px-3 py-2 text-xs ${value===key?'border-gold/40 bg-gold/[.06] text-gold':'border-white/10 text-slate-400'}`}>{value===key?'✓ ':''}{text}</button>)}</div></div>
}

export function VendorContactSummary({ name,email,phone,company }:{ name:string;email:string;phone:string;company?:string }) {
  return <ul className="divide-y divide-white/[.06] text-sm"><SummaryRow icon={<User size={14}/>} label="Name" value={name}/><SummaryRow icon={<Mail size={14}/>} label="Email" value={email}/><SummaryRow icon={<Phone size={14}/>} label="Phone" value={phone}/>{company&&<SummaryRow icon={<Building2 size={14}/>} label="Company" value={company}/>}</ul>
}
function SummaryRow({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) { return <li className="flex items-center gap-3 py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/20 bg-gold/[.06] text-gold">{icon}</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="truncate text-sm font-medium text-white">{value}</p></div></li> }
