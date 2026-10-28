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

export function toonEuro(bedrag: number): string {
  return bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
}

// Aantal dagen tussen een datum (yyyy-mm-dd) en vandaag.
export function dagenGeleden(iso: string): number {
  const dag = 24 * 60 * 60 * 1000
  return Math.round((new Date(`${vandaag()}T12:00:00`).getTime() - new Date(`${iso}T12:00:00`).getTime()) / dag)
}
