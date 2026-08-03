import { useState, type ReactNode } from 'react'

export interface KanbanColumn {
  key: string
  label: string
}

// Native HTML5 drag-and-drop board — no extra dependency. Columns are fixed
// (passed in), cards move between them by dragging or by whatever fallback
// the caller's renderCard provides (e.g. a select, for keyboard/touch users).
export function KanbanBoard<T extends { id: string }>({
  columns,
  items,
  getStatus,
  onMove,
  renderCard,
}: {
  columns: KanbanColumn[]
  items: T[]
  getStatus: (item: T) => string
  onMove: (item: T, toStatus: string) => void | Promise<void>
  renderCard: (item: T) => ReactNode
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => {
        const colItems = items.filter((i) => getStatus(i) === col.key)
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault()
              setOverCol(col.key)
            }}
            onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
            onDrop={(e) => {
              e.preventDefault()
              setOverCol(null)
              const item = items.find((i) => i.id === draggingId)
              if (item && getStatus(item) !== col.key) onMove(item, col.key)
              setDraggingId(null)
            }}
            className={`flex w-72 shrink-0 flex-col rounded-md border transition ${
              overCol === col.key ? 'border-gold/50 bg-gold/[0.04]' : 'border-white/10 bg-white/[0.02]'
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{col.label}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-400">{colItems.length}</span>
            </div>
            <div className="flex min-h-[100px] flex-1 flex-col gap-2 p-2.5">
              {colItems.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-slate-600">No items</p>
              ) : (
                colItems.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggingId(item.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className={`cursor-grab rounded-md border border-white/10 bg-navy-900 p-3 text-sm transition active:cursor-grabbing ${
                      draggingId === item.id ? 'opacity-40' : ''
                    }`}
                  >
                    {renderCard(item)}
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Compact status dropdown fallback shown inside a card — drag works with a
// mouse, but this keeps the board usable on touch devices and for keyboard
// navigation without requiring a second interaction model to build.
export function StageSelect({
  value,
  columns,
  onChange,
}: {
  value: string
  columns: KanbanColumn[]
  onChange: (next: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      draggable={false}
      className="mt-2 w-full rounded-md border border-white/10 bg-navy-950 px-2 py-1 text-xs text-slate-300"
    >
      {columns.map((c) => (
        <option key={c.key} value={c.key}>
          {c.label}
        </option>
      ))}
    </select>
  )
}
