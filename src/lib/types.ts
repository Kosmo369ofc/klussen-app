export type Rol = 'beheerder' | 'medewerker'
export type Contractvorm = 'vast_contract' | 'per_beurt'
export type IntervalEenheid = 'week' | 'maand' | 'jaar'

export interface Medewerker {
  id: string
  user_id: string | null
  naam: string
  email: string
  rol: Rol
  actief: boolean
}

export interface Klant {
  id: string
  naam: string
  adres: string | null
  telefoon: string | null
  contactpersoon: string | null
  contractvorm: Contractvorm
  notities: string | null
  actief: boolean
}

export interface Werkzaamheid {
  id: string
  klant_id: string
  omschrijving: string
  // Leeg: elke beurt.
  interval_aantal: number | null
  interval_eenheid: IntervalEenheid | null
  volgorde: number
  actief: boolean
}

export interface Bezoek {
  id: string
  klant_id: string
  datum: string
  opmerkingen: string | null
  gefactureerd: boolean
  gefactureerd_op: string | null
  aangemaakt_door: string
  bezoek_uren: { medewerker_id: string; uren: number }[]
  bezoekregels: { id: string; werkzaamheid_id: string | null; omschrijving: string }[]
  bezoek_fotos?: { id: string; pad: string }[]
}

// Afspraken over geld en contract; alleen de beheerder kan ze lezen.
export interface Afspraken {
  klant_id: string
  uren: number | null
  periode: 'maand' | 'jaar'
  uurtarief: number | null
  prijs_per_beurt: number | null
  contractbedrag: number | null
  startdatum: string | null
  einddatum: string | null
  prijsafspraak: string | null
  bestand_pad: string | null
  bestand_naam: string | null
}

// Wat de telefoon verstuurt, ook als het eerst offline bewaard is.
export interface NieuwBezoek {
  id: string
  klant_id: string
  datum: string
  opmerkingen: string
  uren: { medewerker_id: string; uren: number }[]
  regels: { werkzaamheid_id: string | null; omschrijving: string }[]
}

const eenheidLabel: Record<IntervalEenheid, [string, string]> = {
  week: ['week', 'weken'],
  maand: ['maand', 'maanden'],
  jaar: ['jaar', 'jaar'],
}

export function intervalLabel(w: Pick<Werkzaamheid, 'interval_aantal' | 'interval_eenheid'>): string {
  if (!w.interval_aantal || !w.interval_eenheid) return 'Elke beurt'
  const [een, meer] = eenheidLabel[w.interval_eenheid]
  return w.interval_aantal === 1 ? `Elke ${een}` : `Elke ${w.interval_aantal} ${meer}`
}

// Datum (yyyy-mm-dd) waarop een werkzaamheid weer aan de beurt is, of null bij 'elke beurt'.
export function volgendeKeer(
  w: Pick<Werkzaamheid, 'interval_aantal' | 'interval_eenheid'>,
  laatst: string | null,
): string | null {
  if (!w.interval_aantal || !w.interval_eenheid || !laatst) return null
  const d = new Date(`${laatst}T12:00:00`)
  if (w.interval_eenheid === 'week') d.setDate(d.getDate() + 7 * w.interval_aantal)
  if (w.interval_eenheid === 'maand') d.setMonth(d.getMonth() + w.interval_aantal)
  if (w.interval_eenheid === 'jaar') d.setFullYear(d.getFullYear() + w.interval_aantal)
  return d.toISOString().slice(0, 10)
}
