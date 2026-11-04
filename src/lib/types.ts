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
  // Aantal keer per interval, bijvoorbeeld 2 keer per maand.
  keer: number
  // Geen vast schema: alleen als het nodig is.
  wanneer_nodig: boolean
  // Bijvoorbeeld m³: de medewerker vult dan in hoeveel het was.
  meeteenheid: string | null
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
  bezoekregels: { id: string; werkzaamheid_id: string | null; omschrijving: string; hoeveelheid: number | null }[]
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
  // Hoe vaak we komen, bijvoorbeeld 2 keer per 1 maand.
  beurten_keer: number | null
  beurten_aantal: number | null
  beurten_eenheid: IntervalEenheid | null
  uren_per_beurt: number | null
  // Vast contract in beurten per periode in plaats van uren.
  contract_beurten: number | null
  // In hoeveel delen per jaar er gefactureerd wordt.
  termijnen: number
}

export type PrijsType = 'inbegrepen' | 'per_keer' | 'per_uur' | 'per_eenheid'

// Prijs van één werkzaamheid; alleen de beheerder kan ze lezen.
export interface WerkPrijs {
  werkzaamheid_id: string
  prijs_type: PrijsType
  bedrag: number | null
  uren_per_keer: number | null
  verwachte_hoeveelheid: number | null
}

// Wat de telefoon verstuurt, ook als het eerst offline bewaard is.
export interface NieuwBezoek {
  id: string
  klant_id: string
  datum: string
  opmerkingen: string
  uren: { medewerker_id: string; uren: number }[]
  regels: { werkzaamheid_id: string | null; omschrijving: string; hoeveelheid?: number | null }[]
}

const eenheidLabel: Record<IntervalEenheid, [string, string]> = {
  week: ['week', 'weken'],
  maand: ['maand', 'maanden'],
  jaar: ['jaar', 'jaar'],
}

export interface Schema {
  keer: number
  interval_aantal: number | null
  interval_eenheid: IntervalEenheid | null
  wanneer_nodig?: boolean
}

export function intervalLabel(w: Schema): string {
  if (w.wanneer_nodig) return 'Als het nodig is'
  if (!w.interval_aantal || !w.interval_eenheid) return 'Elke beurt'
  const [een, meer] = eenheidLabel[w.interval_eenheid]
  const periode = w.interval_aantal === 1 ? een : `${w.interval_aantal} ${meer}`
  return w.keer > 1 ? `${w.keer}× per ${periode}` : `Elke ${periode}`
}

const perJaar: Record<IntervalEenheid, number> = { week: 52, maand: 12, jaar: 1 }

// Hoe vaak per jaar, of null als dat niet vastligt (elke beurt of als het nodig is).
export function keerPerJaar(w: Schema): number | null {
  if (w.wanneer_nodig || !w.interval_aantal || !w.interval_eenheid) return null
  return (w.keer * perJaar[w.interval_eenheid]) / w.interval_aantal
}

// Datum (yyyy-mm-dd) waarop een werkzaamheid weer aan de beurt is, of null zonder vast schema.
export function volgendeKeer(w: Schema, laatst: string | null): string | null {
  if (w.wanneer_nodig || !w.interval_aantal || !w.interval_eenheid || !laatst) return null
  const d = new Date(`${laatst}T12:00:00`)
  if (w.keer > 1) {
    d.setDate(d.getDate() + Math.floor(365.25 / keerPerJaar(w)!))
  } else {
    if (w.interval_eenheid === 'week') d.setDate(d.getDate() + 7 * w.interval_aantal)
    if (w.interval_eenheid === 'maand') d.setMonth(d.getMonth() + w.interval_aantal)
    if (w.interval_eenheid === 'jaar') d.setFullYear(d.getFullYear() + w.interval_aantal)
  }
  return d.toISOString().slice(0, 10)
}

// Urenregistratie: per medewerker per werkdag, los van de klantbeurten.
export interface Werkuren {
  id: string
  medewerker_id: string
  datum: string
  begintijd: string
  eindtijd: string
  pauze_minuten: number
  uren: number
  opmerking: string | null
  goedgekeurd: boolean
  // Voor welke klant, voor de facturatie. Leeg: algemeen werk.
  klant_id: string | null
  // Werk of reistijd. Reistijd telt apart van de werkuren.
  soort: 'werk' | 'reis'
}

// Wie nu aan het werk is (in- en uitklokken).
export interface Ingeklokt {
  medewerker_id: string
  gestart_op: string
  klant_id: string | null
  pauze_sinds: string | null
  pauze_minuten: number
  soort: 'werk' | 'reis'
}

// Gereden kilometers per medewerker per dag.
export interface Dagkilometers {
  medewerker_id: string
  datum: string
  beginstand: number | null
  eindstand: number | null
  km: number | null
}
