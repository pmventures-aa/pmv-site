import { ExternalLink, Mail, PenLine } from 'lucide-react'
import { PageIntro } from '../../components/admin/ui'

const MAIL_ORIGIN = 'https://mail.pinnaclemanagementventures.com'

export default function ExternalWorkspaceLaunch({ kind }: { kind: 'email' | 'signing' }) {
  const signing = kind === 'signing'
  const href = `${MAIL_ORIGIN}/${signing ? 'signing' : 'email'}`
  return (
    <div className="mx-auto max-w-3xl py-12">
      <PageIntro kicker="Pinnacle Workspace" title={signing ? 'Signing Studio' : 'Email Studio'} subtitle="This workspace now opens on the dedicated Pinnacle mail domain." />
      <div className="mt-8 border-y border-white/10 py-10 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gold/10 text-gold">{signing ? <PenLine size={24} /> : <Mail size={24} />}</span>
        <h2 className="mt-5 font-display text-3xl font-semibold text-white">Open the dedicated workspace</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">Your dashboard stays open here while the full communication and signing experience opens in a separate browser tab.</p>
        <a href={href} target="_blank" rel="noreferrer" className="btn-gold mt-7 inline-flex min-h-12 items-center gap-2">Open {signing ? 'Signing Studio' : 'Email Studio'} <ExternalLink size={16} /></a>
      </div>
    </div>
  )
}
