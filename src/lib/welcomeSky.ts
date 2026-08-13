export type SkyPeriod = 'sunrise' | 'day' | 'sunset' | 'night'

export type WelcomeTime = {
  hour: number
  label: string
  period: SkyPeriod
  caption: string
}

export function welcomeTime(date: Date = new Date()): WelcomeTime {
  const hour = date.getHours()
  if (hour < 5) return { hour, label: 'Good evening', period: 'night', caption: 'The day is quiet. The work can wait until morning.' }
  if (hour < 12) return { hour, label: 'Good morning', period: 'sunrise', caption: 'A slow start of light. Plenty of day still ahead.' }
  if (hour < 17) return { hour, label: 'Good afternoon', period: 'day', caption: 'Full light. Take the next clear step.' }
  if (hour < 21) return { hour, label: 'Good evening', period: 'sunset', caption: 'The light is leaving. Close what should not travel overnight.' }
  return { hour, label: 'Good evening', period: 'night', caption: 'Low light. Leave the desk kinder than you found it.' }
}
