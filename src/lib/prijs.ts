import { toonEuro, toonUren } from './datum'
import { intervalLabel, keerPerJaar, volgendeKeer, type Afspraken, type Bezoek, type Contractvorm, type Schema, type WerkPrijs, type Werkzaamheid } from './types'

export const termijnLabel: Record<number, string> = {
  1: '1 keer per jaar',
  2: '2 keer per jaar (per half jaar)',
  3: '3 keer per jaar',
  4: 'Per kwartaal',
  6: 'Per 2 maanden',
  12: 'Per maand',
}

export interface Opbouwregel {
  omschrijving: string
  hoeVaak: string
  // Uren per keer, als bekend.
  uren: number | null
  prijs: string
  // Bedrag over de hele periode; null als het afhangt van hoe vaak het nodig is.
  bedrag: number | null
  // Telt mee in wat de klant betaalt (bij een vast contract alleen het contract zelf).
  telt: boolean
}

// Looptijd van een contract met begin- en einddatum.
export interface Periode {
  van: string
  tot: string
  // Kalendermaanden waarin het contract loopt, de eerste en laatste meegeteld.
  maanden: number
}

export interface Prijsopbouw {
  regels: Opbouwregel[]
  // Wat de klant betaalt over de periode (een jaar, of de looptijd van het contract).
  totaal: number
  periode: Periode | null
  maanden: number
  beurten: number | null
  uren: number | null
  // Aantal facturen in de periode.
  termijnen: number
  // Er zijn regels die naar gebruik worden gefactureerd en niet in het totaal zitten.
  naarGebruik: boolean
  // Vast contract: wat het werk waard is volgens de prijzen bij de werkzaamheden.
  controle: number | null
}

function contractPeriode(a: Afspraken): Periode | null {
  if (!a.startdatum || !a.einddatum || a.einddatum < a.startdatum) return null
  const [vj, vm] = a.startdatum.split('-').map(Number)
  const [tj, tm] = a.einddatum.split('-').map(Number)
  return { van: a.startdatum, tot: a.einddatum, maanden: (tj - vj) * 12 + (tm - vm) + 1 }
}

// Hoe vaak iets met dit schema gebeurt: per jaar, of binnen de periode (de
// eerste keer op de begindatum, de laatste uiterlijk op de einddatum).
function aantalKeer(schema: Schema, periode: Periode | null): number | null {
  if (!periode) return keerPerJaar(schema)
  let d: string | null = periode.van
  let n = 0
  while (d && d <= periode.tot && n < 1000) {
    n++
    d = volgendeKeer(schema, d)
  }
  return d === null ? null : n
}

// Wat één keer van een werkzaamheid kost, of null als er geen aparte prijs is.
export function prijsPerKeer(p: WerkPrijs | undefined, hoeveelheid?: number | null): number | null {
  if (!p || p.bedrag === null) return null
  if (p.prijs_type === 'per_keer') return p.bedrag
  if (p.prijs_type === 'per_uur') return p.uren_per_keer === null ? null : p.bedrag * p.uren_per_keer
  if (p.prijs_type === 'per_eenheid') {
    const h = hoeveelheid === undefined ? p.verwachte_hoeveelheid : hoeveelheid
    return h === null ? null : p.bedrag * h
  }
  return null
}

function prijsTekst(p: WerkPrijs | undefined, eenheid: string | null): string {
  if (!p || p.prijs_type === 'inbegrepen' || p.bedrag === null) return 'Inbegrepen'
  if (p.prijs_type === 'per_keer') return `${toonEuro(p.bedrag)} per keer`
  if (p.prijs_type === 'per_uur') {
    return `${toonEuro(p.bedrag)} per uur${p.uren_per_keer !== null ? ` × ${toonUren(p.uren_per_keer)}` : ''}`
  }
  const e = eenheid || 'eenheid'
  return `${toonEuro(p.bedrag)} per ${e}${p.verwachte_hoeveelheid !== null ? ` × ${String(p.verwachte_hoeveelheid).replace('.', ',')} ${e}` : ''}`
}

// Uren maal uurtarief of de vaste prijs: wat één beurt kost.
function beurtPrijs(a: Afspraken): number | null {
  if (a.prijs_per_beurt != null) return a.prijs_per_beurt
  if (a.uurtarief != null && a.uren_per_beurt != null) return a.uurtarief * a.uren_per_beurt
  return null
}

// Hoe de prijs van een klant tot stand komt, per jaar of over de looptijd van
// een vast contract met begin- en einddatum.
export function prijsopbouw(
  contractvorm: Contractvorm,
  a: Afspraken,
  taken: Werkzaamheid[],
  prijzen: Record<string, WerkPrijs>,
): Prijsopbouw {
  const vast = contractvorm === 'vast_contract'
  const periode = vast ? contractPeriode(a) : null
  const maanden = periode?.maanden ?? 12
  // Contractbedrag, uren en beurten staan per maand of per jaar.
  const factor = a.periode === 'maand' ? maanden : maanden / 12
  const urenPerBeurt = a.uren_per_beurt ?? null
  const regels: Opbouwregel[] = []
  const beurtSchema = { keer: a.beurten_keer ?? 1, interval_aantal: a.beurten_aantal ?? null, interval_eenheid: a.beurten_eenheid ?? null }
  let beurten = aantalKeer(beurtSchema, periode)
  if (beurten === null && vast && a.contract_beurten != null) beurten = Math.round(a.contract_beurten * factor)
  let uren = beurten !== null && urenPerBeurt !== null ? beurten * urenPerBeurt : null

  if (vast) {
    if (a.uren != null) uren = a.uren * factor
    const afgesproken =
      a.contract_beurten != null ? `${a.contract_beurten} beurten per ${a.periode}` : a.uren != null ? `${toonUren(a.uren)} per ${a.periode}` : null
    regels.push({
      omschrijving: 'Vast contract',
      hoeVaak: beurtSchema.interval_aantal !== null ? intervalLabel(beurtSchema) : (afgesproken ?? `Per ${a.periode}`),
      uren: urenPerBeurt,
      prijs: a.contractbedrag != null ? `${toonEuro(a.contractbedrag)} per ${a.periode}` : 'Nog geen bedrag',
      bedrag: a.contractbedrag != null ? a.contractbedrag * factor : null,
      telt: true,
    })
  } else {
    const prijs = beurtPrijs(a)
    regels.push({
      omschrijving: 'Beurt',
      hoeVaak: beurtSchema.interval_aantal !== null ? intervalLabel(beurtSchema) : 'Nog niet ingesteld',
      uren: urenPerBeurt,
      prijs:
        a.prijs_per_beurt != null
          ? `${toonEuro(a.prijs_per_beurt)} per beurt`
          : a.uurtarief != null
            ? `${toonEuro(a.uurtarief)} per uur${urenPerBeurt !== null ? ` × ${toonUren(urenPerBeurt)}` : ''}`
            : 'Nog geen prijs',
      bedrag: prijs !== null && beurten !== null ? prijs * beurten : null,
      telt: true,
    })
  }

  let naarGebruik = false
  for (const t of taken.filter((t) => t.actief)) {
    const p = prijzen[t.id]
    const keer = t.wanneer_nodig ? null : t.interval_aantal ? aantalKeer(t, periode) : beurten
    const perKeer = prijsPerKeer(p)
    const heeftPrijs = !!p && p.prijs_type !== 'inbegrepen' && p.bedrag != null
    const bedrag = heeftPrijs && perKeer !== null && keer !== null ? perKeer * keer : null
    if (heeftPrijs && bedrag === null && !vast) naarGebruik = true
    regels.push({
      omschrijving: t.omschrijving,
      hoeVaak: intervalLabel(t),
      uren: p?.uren_per_keer ?? null,
      prijs: prijsTekst(p, t.meeteenheid),
      bedrag,
      telt: !vast,
    })
  }

  const som = (lijst: Opbouwregel[]) => lijst.reduce((s, r) => s + (r.bedrag ?? 0), 0)
  const extra = regels.filter((r) => !r.telt && r.bedrag !== null)
  return {
    regels,
    totaal: som(regels.filter((r) => r.telt)),
    periode,
    maanden,
    beurten,
    uren,
    termijnen: periode ? Math.max(1, Math.round(((a.termijnen || 1) * maanden) / 12)) : a.termijnen || 1,
    naarGebruik,
    controle: vast && extra.length ? som(extra) : null,
  }
}

// Indicatie van het bedrag van één bezoek bij klanten die per beurt betalen:
// de beurt zelf plus werk met een eigen prijs, zoals m³ groenafval.
export function bezoekBedrag(
  b: Pick<Bezoek, 'bezoek_uren' | 'bezoekregels'>,
  contractvorm: Contractvorm,
  a: Afspraken | undefined,
  prijzen: Record<string, WerkPrijs>,
): number | null {
  let bedrag: number | null = null
  const tel = (n: number | null) => {
    if (n !== null) bedrag = (bedrag ?? 0) + n
  }
  if (a && contractvorm === 'per_beurt') {
    const uren = b.bezoek_uren.reduce((som, u) => som + Number(u.uren), 0)
    tel(a.prijs_per_beurt ?? (a.uurtarief !== null ? a.uurtarief * uren : null))
  }
  // Bij een vast contract zijn de prijzen bij werkzaamheden alleen ter controle.
  if (contractvorm === 'vast_contract') return null
  for (const r of b.bezoekregels) {
    if (r.werkzaamheid_id) tel(prijsPerKeer(prijzen[r.werkzaamheid_id], r.hoeveelheid ?? null))
  }
  return bedrag
}
