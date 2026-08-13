import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { visibleWhoRows, whoDisplayName, type WhoPerson, type WhoRow } from '../../lib/who'
import { Avatar } from './Avatar'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function PersonChip({ person }: { person: WhoPerson }) {
  const label = whoDisplayName(person)
  const inner = (
    <>
      {person.userId ? (
        <Avatar userId={person.userId} name={label} size={22} />
      ) : (
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-white/10 text-[9px] font-bold text-slate-300 ring-1 ring-white/15">
          {initialsOf(label)}
        </span>
      )}
      <span className="min-w-0 truncate font-medium text-white">{person.name || person.email}</span>
      {person.name && person.email && <span className="min-w-0 truncate text-slate-500">{person.email}</span>}
      {person.role && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">{person.role}</span>}
    </>
  )
  const cls = 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/[.03] px-2 py-1 text-[12px] leading-none'
  if (person.href) {
    return <Link to={person.href} className={`${cls} transition hover:border-gold/40 hover:text-gold`}>{inner}</Link>
  }
  return <span className={cls}>{inner}</span>
}

export function WhoSection({ rows, className = '', eyebrow = 'Who' }: { rows: WhoRow[]; className?: string; eyebrow?: string | null }) {
  const visible = visibleWhoRows(rows)
  if (!visible.length) return null
  return (
    <section className={`border-b border-white/10 px-4 py-3 ${className}`} aria-label="Who">
      {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">{eyebrow}</p>}
      <dl className={eyebrow ? 'mt-2 space-y-2' : 'space-y-2'}>
        {visible.map((row) => (
          <div key={row.label} className="flex items-start gap-3">
            <dt className="w-[4.25rem] shrink-0 pt-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{row.label}</dt>
            <dd className="min-w-0 flex-1">
              {row.people && row.people.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {row.people.map((person) => (
                    <PersonChip key={`${person.userId || ''}-${person.email || whoDisplayName(person)}`} person={person} />
                  ))}
                </div>
              )}
              {row.text && <p className="pt-1.5 text-[13px] text-slate-300">{row.text}</p>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function SessionWho({ hint }: { hint?: string }) {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-navy-900/40">
      <WhoSection
        className="border-b-0"
        rows={[{
          label: 'You',
          people: [{
            name: user.full_name,
            email: user.email,
            userId: user.id,
            role: user.role === 'admin' ? 'Admin' : user.role === 'staff' ? 'Staff' : user.role,
          }],
        }]}
      />
      {hint && <p className="border-t border-white/10 px-4 py-2.5 text-[12px] leading-5 text-slate-500">{hint}</p>}
    </div>
  )
}
