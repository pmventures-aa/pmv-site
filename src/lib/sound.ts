// Synthesized notification tones — no audio asset files needed. Browsers
// block audio until the page has seen at least one user gesture (click,
// keypress); since polling fires without one, the very first chime after
// load may be silently skipped until the staff member interacts with the
// page at all, which is normal and not worth working around.
let ctx: AudioContext | null = null
function getCtx(): AudioContext | null {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(freqs: number[], gap = 0.09) {
  const audioCtx = getCtx()
  if (!audioCtx) return
  try {
    const now = audioCtx.currentTime
    freqs.forEach((freq, i) => {
      const start = now + i * gap
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start(start)
      osc.stop(start + 0.32)
    })
  } catch {
    // AudioContext exists but playback failed (autoplay policy etc.) — skip.
  }
}

export type SoundKind = 'default' | 'urgent'

// Events that warrant the sharper "urgent" tone instead of the soft default
// chime — new client-facing work landing (an inquiry, a support ticket) or
// a sensitive action (viewing decrypted banking info) worth noticing.
const URGENT_KINDS = new Set(['inquiry_submitted', 'ticket_created', 'payment_info_revealed'])

export function soundKindFor(activityKind: string): SoundKind {
  return URGENT_KINDS.has(activityKind) ? 'urgent' : 'default'
}

export function playNotificationSound(kind: SoundKind = 'default') {
  if (kind === 'urgent') {
    tone([660, 660], 0.14) // two firm beeps, same pitch
  } else {
    tone([880, 1320], 0.09) // soft ascending two-note chime
  }
}
