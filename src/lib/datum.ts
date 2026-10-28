export function vandaag(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function toonDatum(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function toonUren(uren: number): string {
  return `${uren.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur`
}
