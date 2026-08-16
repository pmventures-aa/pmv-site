import { useState } from 'react'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { BrandMark3D } from '../../components/ui'
import { Reveal } from '../../components/public/motion'
import { inputCls, btnPrimary } from '../../components/admin/ui'
import { usePageMeta } from '../../lib/usePageMeta'

type VerificationResult = {
  found: boolean
  status?: 'valid' | 'voided' | 'revoked' | 'unknown'
  public_id?: string
  issuer_name?: string
  document_label?: string | null
  completed_date?: string | null
  signer_count?: number
  final_pdf_sha256_prefix?: string | null
  sealed_at?: string | null
}

type HashResult = {
  found: boolean
  match: boolean
  expected_sha256?: string
  submitted_sha256?: string
  audit_certificate_sha256?: string
  manifest_sha256?: string
  event_chain_head_hash?: string
  signature_algorithm?: string
  public_key_id?: string | null
  sealed_at?: string
  error?: string
}

async function localSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function VerifyDocument() {
  usePageMeta('Verify a Document', 'Verify the integrity record for a document or envelope issued through Pinnacle Management Ventures without exposing signer or document contents.')
  const [id, setId] = useState('')
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hashId, setHashId] = useState('')
  const [hashFile, setHashFile] = useState<File | null>(null)
  const [hashResult, setHashResult] = useState<HashResult | null>(null)
  const [hashBusy, setHashBusy] = useState(false)
  const [hashError, setHashError] = useState('')

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    const value = id.trim().toUpperCase()
    if (!value) return
    setLoading(true); setError(''); setResult(null)
    try {
      const response = await fetch(`/api/public/verify/${encodeURIComponent(value)}`, { headers: { Accept: 'application/json' } })
      if (!response.ok && response.status !== 404) throw new Error('Verification service unavailable')
      const data = await response.json() as VerificationResult
      setResult(data)
    } catch {
      setError('We could not complete verification right now. Please try again later.')
    } finally { setLoading(false) }
  }

  async function verifyHash(e: React.FormEvent) {
    e.preventDefault()
    const value = hashId.trim().toUpperCase()
    if (!value || !hashFile) return
    setHashBusy(true); setHashError(''); setHashResult(null)
    try {
      const digest = await localSha256(hashFile)
      const response = await fetch('/api/public/verify/hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ publicId: value, sha256: digest }),
      })
      const data = await response.json() as HashResult
      if (!response.ok) throw new Error(data.error || 'Verification service unavailable')
      setHashResult(data)
    } catch (err: any) {
      setHashError(err.message || 'We could not complete verification right now. Please try again later.')
    } finally { setHashBusy(false) }
  }

  const valid = result?.found && result.status === 'valid'
  const hashValid = hashResult?.found && hashResult.match === true
  return <div className="min-h-screen bg-navy-950"><Header/><main>
    <section className="pmv-hero-story relative overflow-hidden border-b border-white/10"><div className="pmv-hero-gold" aria-hidden="true"/><div className="container-pmv grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_.65fr] lg:items-center"><Reveal><p className="eyebrow">Document Verification</p><h1 className="mt-4 max-w-3xl font-display text-4xl font-medium leading-tight text-white sm:text-6xl">Verify a Pinnacle document without exposing private information.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">Enter the public document or envelope ID shown on the signed record or audit certificate. Verification checks Pinnacle's stored integrity record only. It does not display the document, signer identities, IP addresses, device details, or client information.</p></Reveal><Reveal className="flex justify-center"><BrandMark3D size={190} decorative/></Reveal></div></section>

    <section className="container-pmv py-14 sm:py-16"><div className="mx-auto max-w-3xl"><Reveal><form onSubmit={verify} className="surface-panel-strong p-6 sm:p-8"><label className="block text-sm font-semibold text-white" htmlFor="verification-id">Document or envelope ID</label><p className="mt-1 text-sm text-slate-400">Example: PMV-9F4K-7Q2M</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input id="verification-id" autoComplete="off" className={`${inputCls} flex-1 uppercase tracking-[.12em]`} placeholder="PMV-XXXX-XXXX" value={id} onChange={e=>setId(e.target.value)}/><button className={btnPrimary} disabled={loading}>{loading?'Checking…':'Verify'}</button></div>{error&&<p className="mt-4 text-sm text-rose-300">{error}</p>}</form></Reveal>

      {result && <Reveal className="mt-6 surface-panel p-6 sm:p-8">{result.found?<><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Verification result</p><h2 className={`mt-2 font-display text-3xl ${valid?'text-emerald-300':'text-amber-300'}`}>{valid?'Integrity record verified':result.status==='voided'?'Envelope voided':result.status==='revoked'?'Verification revoked':'Verification status unavailable'}</h2></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[.12em] ${valid?'border-emerald-400/30 bg-emerald-400/10 text-emerald-300':'border-amber-400/30 bg-amber-400/10 text-amber-300'}`}>{result.status}</span></div><dl className="mt-7 divide-y divide-white/10 border-y border-white/10 text-sm">{[
        ['Public ID',result.public_id],['Issuer',result.issuer_name||'Pinnacle Management Ventures'],['Document',result.document_label||'Private document'],['Completed',result.completed_date||'Not provided'],['Signer count',String(result.signer_count??0)],['Integrity fingerprint',result.final_pdf_sha256_prefix||'Not provided'],['Sealed',result.sealed_at?new Date(result.sealed_at).toLocaleString():'Not provided']
      ].map(([a,b])=><div key={a} className="grid gap-2 py-4 sm:grid-cols-[190px_1fr]"><dt className="text-slate-500">{a}</dt><dd className="text-slate-200">{b}</dd></div>)}</dl><p className="mt-5 text-xs leading-5 text-slate-500">A verified result confirms that the public ID corresponds to Pinnacle's stored integrity record and that the recorded sealed artifact fingerprint matches that record. It is not a public disclosure of the underlying agreement or signer evidence.</p></>:<><p className="eyebrow">Verification result</p><h2 className="mt-2 font-display text-3xl text-white">No matching public record found.</h2><p className="mt-3 text-sm leading-6 text-slate-400">Check the ID exactly as printed on the document or audit certificate. For privacy and security, this page does not reveal whether similar IDs exist.</p></>}</Reveal>}

      <Reveal className="mt-8"><form onSubmit={verifyHash} className="surface-panel p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">File fingerprint check</p><h2 className="mt-1 font-display text-2xl text-white">Confirm a downloaded file matches the sealed original</h2></div></div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Select the signed PDF you downloaded and enter its public ID. The fingerprint (SHA-256) is computed locally in your browser and compared against Pinnacle's sealed record. The file itself is never uploaded.</p><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr]"><div><label className="block text-xs font-bold text-slate-300" htmlFor="verification-id-hash">Document or envelope ID</label><input id="verification-id-hash" autoComplete="off" className={`${inputCls} mt-2 w-full uppercase tracking-[.12em]`} placeholder="PMV-XXXX-XXXX" value={hashId} onChange={e=>setHashId(e.target.value)}/></div><div><label className="block text-xs font-bold text-slate-300" htmlFor="verification-file">Signed PDF file</label><input id="verification-file" type="file" accept="application/pdf,.pdf" className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-gold/15 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gold" onChange={e=>setHashFile(e.target.files?.[0]||null)}/></div></div><button className={`${btnPrimary} mt-5`} disabled={hashBusy||!hashId.trim()||!hashFile}>{hashBusy?'Computing fingerprint…':'Check Fingerprint'}</button>{hashError&&<p className="mt-4 text-sm text-rose-300">{hashError}</p>}
        {hashResult&&<div className={`mt-6 rounded-xl border p-5 ${hashValid?'border-emerald-400/30 bg-emerald-400/[.06]':'border-rose-400/30 bg-rose-400/[.06]'}`}><h3 className={`font-display text-xl ${hashValid?'text-emerald-300':'text-rose-300'}`}>{hashValid?'File fingerprint matches the sealed record':'File fingerprint does not match the sealed record'}</h3>{hashResult.found===false&&<p className="mt-2 text-sm text-slate-300">No matching sealed record was found for that public ID.</p>}{hashResult.expected_sha256&&<dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[200px_1fr]">{[
          ['Expected SHA-256',hashResult.expected_sha256],['File SHA-256',hashResult.submitted_sha256||''],['Audit certificate SHA-256',hashResult.audit_certificate_sha256||''],['Evidence manifest SHA-256',hashResult.manifest_sha256||''],['Event chain head',hashResult.event_chain_head_hash||''],['Seal algorithm',hashResult.signature_algorithm||''],['Seal key ID',hashResult.public_key_id||'Not disclosed']
        ].map(([a,b])=><div key={a} className="grid gap-1 py-3 sm:grid-cols-[220px_1fr]"><dt className="font-semibold text-slate-500">{a}</dt><dd className="break-all text-slate-200">{b}</dd></div>)}</dl>}</div>}
      </form></Reveal>
    </div></section>
  </main><Footer/></div>
}
