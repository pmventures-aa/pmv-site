import { Link } from 'react-router-dom'
import { useAppPath } from '../../lib/basePath'
import { Icon } from './Icon'

// Top-bar shortcut into the Communications / Email Center workspace.
// Sits next to MailBell (which points at the internal messages Inbox) so
// staff have both outbound campaign email and inbound conversation
// threads one click away.
export function EmailCenterBell() {
  const p = useAppPath()
  return (
    <Link
      to={p('communications')}
      className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 transition-all duration-200 hover:border-gold/40 hover:bg-gold/5 hover:text-gold"
      aria-label="Email Center"
      title="Email Center - campaigns, templates, drafts"
    >
      <Icon name="communications" size={16} />
    </Link>
  )
}
