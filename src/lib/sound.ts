let ctx: AudioContext | null = null
let unlockInstalled = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function primeAudio(): void {
  const audioCtx = getCtx()
  if (!audioCtx) return
  if (audioCtx.state === 'suspended') void audioCtx.resume()
}

export function installAudioUnlock(): void {
  if (typeof window === 'undefined' || unlockInstalled) return
  unlockInstalled = true
  const unlock = () => {
    primeAudio()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('touchstart', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('touchstart', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
}

function pulseDevice(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try { navigator.vibrate(pattern) } catch { /* device or browser policy */ }
}

function tone(freqs: number[], gap = 0.09, gainLevel = 0.12, duration = 0.28) {
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
      gain.gain.exponentialRampToValueAtTime(gainLevel, start + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.04)
    })
  } catch {
    // The browser may still decline audio if the page has never received a user gesture.
  }
}

export type SoundKind = 'default' | 'urgent'
const URGENT_KINDS = new Set(['inquiry_submitted', 'ticket_created', 'payment_info_revealed', 'login_failed'])

export function soundKindFor(activityKind: string): SoundKind {
  return URGENT_KINDS.has(activityKind) ? 'urgent' : 'default'
}

export function playNotificationSound(kind: SoundKind = 'default') {
  if (kind === 'urgent') {
    tone([620, 620], 0.14, 0.14, 0.3)
    pulseDevice([60, 45, 60])
  } else {
    tone([784, 1175], 0.1, 0.11, 0.27)
    pulseDevice(45)
  }
}

export function welcomeSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem('pmv_welcome_sound') !== 'off'
}

export function setWelcomeSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('pmv_welcome_sound', enabled ? 'on' : 'off')
}

export function playWelcomeSound(surface: 'client' | 'staff' = 'client') {
  if (!welcomeSoundEnabled()) return
  primeAudio()
  if (surface === 'staff') {
    tone([523.25, 659.25, 783.99], 0.095, 0.09, 0.3)
  } else {
    tone([587.33, 739.99, 880], 0.1, 0.085, 0.31)
  }
}

// Optional public micro-sound feedback. Defaults to OFF. Only meaningful
// direct interactions play sound (step complete, request submitted) and the
// preference is persisted locally. Audio is never required: if it fails or is
// disabled the UI behaves identically.
const PUBLIC_SOUND_KEY = 'pmv_sound_effects'

export function publicSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(PUBLIC_SOUND_KEY) === 'on'
}

export function setPublicSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PUBLIC_SOUND_KEY, enabled ? 'on' : 'off')
}

export type PublicSoundKind = 'step' | 'success'

export function playPublicSound(kind: PublicSoundKind) {
  if (!publicSoundEnabled()) return
  primeAudio()
  if (kind === 'success') {
    tone([659.25, 880, 1108.73], 0.07, 0.1, 0.3)
    pulseDevice(40)
  } else {
    tone([587.33], 0, 0.06, 0.12)
  }
}
