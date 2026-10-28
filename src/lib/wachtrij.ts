import { supabase } from './supabase'
import type { NieuwBezoek } from './types'

// Bezoeken die nog niet verstuurd konden worden, bewaard op de telefoon.
const SLEUTEL = 'klussen-app:wachtrij'

function lees(): NieuwBezoek[] {
  try {
    return JSON.parse(localStorage.getItem(SLEUTEL) ?? '[]') as NieuwBezoek[]
  } catch {
    return []
  }
}

function schrijf(rij: NieuwBezoek[]) {
  localStorage.setItem(SLEUTEL, JSON.stringify(rij))
  window.dispatchEvent(new Event('wachtrij'))
}

export function aantalInWachtrij(): number {
  return lees().length
}

async function verstuur(bezoek: NieuwBezoek) {
  const { error } = await supabase.rpc('bezoek_opslaan', { bezoek })
  if (error) throw error
}

function isNetwerkfout(fout: unknown): boolean {
  if (!navigator.onLine) return true
  const tekst = fout instanceof Error ? fout.message : String((fout as { message?: string })?.message ?? fout)
  return /fetch|network|netwerk|load failed/i.test(tekst)
}

// Geeft 'verstuurd' of 'bewaard' terug. Andere fouten (bijv. geen rechten) gooit hij door.
export async function bezoekOpslaan(bezoek: NieuwBezoek): Promise<'verstuurd' | 'bewaard'> {
  try {
    await verstuur(bezoek)
    return 'verstuurd'
  } catch (fout) {
    if (!isNetwerkfout(fout)) throw fout
    schrijf([...lees().filter((b) => b.id !== bezoek.id), bezoek])
    return 'bewaard'
  }
}

let bezig = false

export async function wachtrijVersturen() {
  if (bezig || !navigator.onLine) return
  bezig = true
  try {
    for (const bezoek of lees()) {
      try {
        await verstuur(bezoek)
        schrijf(lees().filter((b) => b.id !== bezoek.id))
      } catch (fout) {
        if (isNetwerkfout(fout)) break
        console.error('Bezoek uit wachtrij geweigerd', bezoek, fout)
      }
    }
  } finally {
    bezig = false
  }
}

window.addEventListener('online', () => void wachtrijVersturen())
