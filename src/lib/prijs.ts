import { toonEuro, toonUren } from './datum'
import { intervalLabel, keerPerJaar, type Afspraken, type Bezoek, type Contractvorm, type WerkPrijs, type Werkzaamheid } from './types'

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
  // Bedrag per jaar; null als het afhangt van hoe vaak het nodig is.
  perJaar: number | null
}

export interface Prijsopbouw {
  regels: Opbouwregel[]
  totaalPerJaar: number
  urenPerJaar: number | null
  beurtenPerJaar: number | null
  // Er zijn regels die naar gebruik worden gefactureerd en niet in het totaal zitten.
  naarGebruik: boolean
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
  if (a.prijs_per_beurt !== null) return a.prijs_per_beurt
  if (a.uurtarief !== null && a.uren_per_beurt !== null) return a.uurtarief * a.uren_per_beurt
  return null
}

// Hoe de prijs van een klant tot stand komt, per jaar.
export function prijsopbouw(
  contractvorm: Contractvorm,
  a: Afspraken,
  taken: Werkzaamheid[],
  prijzen: Record<string, WerkPrijs>,
): Prijsopbouw {
  const regels: Opbouwregel[] = []
  const beurtSchema = {
    keer: a.beurten_keer ?? 1,
    interval_aantal: a.beurten_aantal,
    interval_eenheid: a.beurten_eenheid,
  }
  const beurtenPerJaar = keerPerJaar(beurtSchema)
  let urenPerJaar: number | null = null

  if (contractvorm === 'vast_contract') {
    const factor = a.periode === 'maand' ? 12 : 1
    if (a.uren !== null) urenPerJaar = a.uren * factor
    regels.push({
      omschrijving: 'Vast contract',
      hoeVaak: beurtenPerJaar !== null ? intervalLabel(beurtSchema) : `Per ${a.periode}`,
      uren: a.uren_per_beurt,
      prijs: a.contractbedrag !== null ? `${toonEuro(a.contractbedrag)} per ${a.periode}` : 'Nog geen bedrag',
      perJaar: a.contractbedrag !== null ? a.contractbedrag * factor : null,
    })
  } else {
    const prijs = beurtPrijs(a)
    if (beurtenPerJaar !== null && a.uren_per_beurt !== null) urenPerJaar = beurtenPerJaar * a.uren_per_beurt
    regels.push({
      omschrijving: 'Beurt',
      hoeVaak: beurtenPerJaar !== null ? intervalLabel(beurtSchema) : 'Nog niet ingesteld',
      uren: a.uren_per_beurt,
      prijs:
        a.prijs_per_beurt !== null
          ? `${toonEuro(a.prijs_per_beurt)} per beurt`
          : a.uurtarief !== null
            ? `${toonEuro(a.uurtarief)} per uur${a.uren_per_beurt !== null ? ` × ${toonUren(a.uren_per_beurt)}` : ''}`
            : 'Nog geen prijs',
      perJaar: prijs !== null && beurtenPerJaar !== null ? prijs * beurtenPerJaar : null,
    })
  }

  let naarGebruik = false
  for (const t of taken.filter((t) => t.actief)) {
    const p = prijzen[t.id]
    const keer = t.wanneer_nodig ? null : (keerPerJaar(t) ?? beurtenPerJaar)
    const perKeer = prijsPerKeer(p)
    const heeftPrijs = !!p && p.prijs_type !== 'inbegrepen' && p.bedrag !== null
    const perJaar = heeftPrijs && perKeer !== null && keer !== null ? perKeer * keer : null
    if (heeftPrijs && perJaar === null) naarGebruik = true
    regels.push({
      omschrijving: t.omschrijving,
      hoeVaak: intervalLabel(t),
      uren: p?.uren_per_keer ?? null,
      prijs: prijsTekst(p, t.meeteenheid),
      perJaar,
    })
  }

  return {
    regels,
    totaalPerJaar: regels.reduce((som, r) => som + (r.perJaar ?? 0), 0),
    urenPerJaar,
    beurtenPerJaar,
    naarGebruik,
  }
}

// Indicatie van het bedrag van één bezoek: de beurt zelf (alleen bij klanten
// die per beurt betalen) plus werk met een eigen prijs, zoals m³ groenafval.
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
  for (const r of b.bezoekregels) {
    if (r.werkzaamheid_id) tel(prijsPerKeer(prijzen[r.werkzaamheid_id], r.hoeveelheid ?? null))
  }
  return bedrag
}
