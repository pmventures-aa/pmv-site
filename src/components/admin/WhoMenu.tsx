import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, LogOut, Settings } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { Avatar } from '../kit/Avatar'
import { pmvMotion } from '../../lib/motionTheme'

export function WhoMenu({
  placement = 'up',
  compact = false,
  canOpenSettings = false,
}: {
  placement?: 'up' | 'down'
  compact?: boolean
  canOpenSettings?: boolean
}) {
  const { user, logout } = useAuth()
  const p = useAppPath()
  const [open, setOpen] = useState(false)
  if (!user) return null

  const menuCls = placement === 'up'
    ? 'absolute bottom-full left-0 right-0 mb-2'
    : compact
      ? 'absolute right-0 top-full mt-2 w-64'
      : 'absolute left-0 right-0 top-full mt-2'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2.5 rounded-lg text-left transition hover:bg-white/[.04] ${compact ? 'max-w-[220px] px-1.5 py-1' : 'w-full px-2 py-2'}`}
        aria-label="Who you are"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar userId={user.id} name={user.full_name} size={compact ? 28 : 36} editable={!compact} uploadPath="/me/avatar" />
        <div className={`min-w-0 flex-1 ${compact ? 'hidden sm:block' : ''}`}>
          <p className={`truncate font-medium text-white ${compact ? 'text-xs' : 'text-sm'}`}>{user.full_name || user.email}</p>
          <p className={`truncate text-slate-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>{user.email}</p>
        </div>
        <ChevronDown size={14} className={`shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: placement === 'up' ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'up' ? 5 : -5, scale: 0.985 }}
            transition={pmvMotion.ui}
            role="menu"
            className={`${menuCls} z-40 overflow-hidden rounded-lg border border-white/10 bg-navy-900 shadow-2xl`}
          >
            <div className="border-b border-white/10 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Who</p>
              <p className="mt-1 truncate text-sm font-medium text-white">{user.full_name || user.email}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
            {canOpenSettings && (
              <NavLink
                to={p('settings')}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                <Settings size={15} /> Settings
              </NavLink>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white ${canOpenSettings ? 'border-t border-white/10' : ''}`}
            >
              <LogOut size={15} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
