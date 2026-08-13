import { Link } from 'react-router-dom'
import { useAppPath } from '../../lib/basePath'
import { Icon } from './Icon'
import { useEmailUnreadCount } from '../../lib/useEmailUnread'

export function EmailCenterBell() {
  const p = useAppPath()
  const { count } = useEmailUnreadCount()
  return (
    <Link
      to={`${p('messages')}?tab=email`}
      className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 transition-all duration-200 hover:border-gold/40 hover:bg-gold/5 hover:text-gold"
      aria-label={count ? `Communications, ${count} unread email${count === 1 ? '' : 's'}` : 'Communications'}
      title="Communications - inbound and outbound email"
    >
      <Icon name="communications" size={16} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
