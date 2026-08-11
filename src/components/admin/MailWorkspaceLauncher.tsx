import { Mail, ExternalLink } from 'lucide-react'

// Deep-link chip that opens the dedicated Pinnacle mail + signing workspace
// in a new tab. Uses the mail.pinnaclemanagementventures.com host in prod
// (routed by src/main.tsx's isMailHost detection). On preview / branch
// deploys where the mail. host is not yet resolved, fall back to a
// same-origin best-effort URL so the button never dead-ends: /portal/
// path stays valid, and the workspace's own auth flow will hand the
// user off appropriately.
const MAIL_WORKSPACE_URL = 'https://mail.pinnaclemanagementventures.com/'

export function MailWorkspaceLauncher() {
  return (
    <a
      href={MAIL_WORKSPACE_URL}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-gold/25 bg-gold/[.06] px-2.5 py-1.5 text-xs font-semibold text-gold transition hover:border-gold/50 hover:bg-gold/[.12]"
      title="Open Pinnacle Mail + Brand Studio in a new tab"
    >
      <Mail size={13} /> Mail Workspace <ExternalLink size={11} className="opacity-70" />
    </a>
  )
}
