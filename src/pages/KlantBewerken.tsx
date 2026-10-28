import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { bekijkLinks } from '../lib/bestanden'
import { termijnLabel } from '../lib/prijs'
import PrijsopbouwTabel from './PrijsopbouwTabel'
import type { Afspraken, Contractvorm, IntervalEenheid, Klant, PrijsType, WerkPrijs, Werkzaamheid } from '../lib/types'

type HoeVaak = 'beurt' | 'schema' | 'nodig'

// Alles als tekst zoals het in de velden staat; leeg betekent: niet ingevuld.
interface TaakInvoer {
  id?: string
  omschrijving: string
  actief: boolean
  hoeVaak: HoeVaak
  keer: string
  aantal: string
  eenheid: IntervalEenheid
  prijsType: PrijsType
  bedrag: string
  uren: string
  hoeveelheid: string
  meeteenheid: string
}

const nieuweTaak = (wijziging: Partial<TaakInvoer> = {}): TaakInvoer => ({
  omschrijving: '',
  actief: true,
  hoeVaak: 'beurt',
  keer: '1',
  aantal: '1',
  eenheid: 'maand',
  prijsType: 'inbegrepen',
  bedrag: '',
  uren: '',
  hoeveelheid: '',
  meeteenheid: '',
  ...wijziging,
})

const leeg = { uren: '', uurtarief: '', prijsPerBeurt: '', contractbedrag: '', urenPerBeurt: '', contractBeurten: '' }

function naarTekst(n: number | null): string {
  return n === null ? '' : String(n).replace('.', ',')
}

function naarGetal(tekst: string): number | null | 'fout' {
  if (!tekst.trim()) return null
  const n = Number(tekst.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 'fout'
}

// Voor de voorbeeldberekening: een fout getal telt als niet ingevuld.
const getal = (tekst: string) => {
  const n = naarGetal(tekst)
  return n === 'fout' ? null : n
}

function heelGetal(tekst: string, min: number, max: number): boolean {
  const n = Number(tekst)
  return Number.isInteger(n) && n >= min && n <= max
}

function SchemaVelden(props: {
  keer: string
  aantal: string
  eenheid: IntervalEenheid
  wijzig: (w: { keer?: string; aantal?: string; eenheid?: IntervalEenheid }) => void
}) {
  const meer = props.aantal !== '1'
  return (
    <div className="rij schema">
      <input inputMode="numeric" className="kort" aria-label="Aantal keer" value={props.keer}
        onChange={(e) => props.wijzig({ keer: e.target.value.replace(/\D/g, '') })} />
      <span>keer per</span>
      <input inputMode="numeric" className="kort" aria-label="Aantal weken, maanden of jaren" value={props.aantal}
        onChange={(e) => props.wijzig({ aantal: e.target.value.replace(/\D/g, '') })} />
      <select value={props.eenheid} onChange={(e) => props.wijzig({ eenheid: e.target.value as IntervalEenheid })}>
        <option value="week">{meer ? 'weken' : 'week'}</option>
        <option value="maand">{meer ? 'maanden' : 'maand'}</option>
        <option value="jaar">jaar</option>
      </select>
    </div>
  )
}

export default function KlantBewerken() {
  const { id } = useParams()
  const nieuw = !id
  const navigate = useNavigate()
  const [naam, setNaam] = useState('')
  const [adres, setAdres] = useState('')
  const [telefoon, setTelefoon] = useState('')
  const [contactpersoon, setContactpersoon] = useState('')
  const [notities, setNotities] = useState('')
  const [actief, setActief] = useState(true)
  const [contractvorm, setContractvorm] = useState<Contractvorm>('per_beurt')
  const [bedragen, setBedragen] = useState(leeg)
  const [periode, setPeriode] = useState<'maand' | 'jaar'>('maand')
  const [startdatum, setStartdatum] = useState('')
  const [einddatum, setEinddatum] = useState('')
  const [prijsafspraak, setPrijsafspraak] = useState('')
  const [bestand, setBestand] = useState<{ pad: string; naam: string } | null>(null)
  const [bestandLink, setBestandLink] = useState<string | null>(null)
  const [nieuwBestand, setNieuwBestand] = useState<File | null>(null)
  const [beurtSchema, setBeurtSchema] = useState({ aan: false, keer: '1', aantal: '1', eenheid: 'maand' as IntervalEenheid })
  const [termijnen, setTermijnen] = useState(1)
  const [afgesprokenIn, setAfgesprokenIn] = useState<'uren' | 'beurten'>('uren')
  const [taken, setTaken] = useState<TaakInvoer[]>([])
  const [verwijderd, setVerwijderd] = useState<string[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  useEffect(() => {
    if (!id) return
    supabase.from('klanten').select('*').eq('id', id).single().then(({ data }) => {
      const k = data as Klant
      setNaam(k.naam)
      setAdres(k.adres ?? '')
      setTelefoon(k.telefoon ?? '')
      setContactpersoon(k.contactpersoon ?? '')
      setNotities(k.notities ?? '')
      setActief(k.actief)
      setContractvorm(k.contractvorm)
    })
    supabase.from('contracten').select('*').eq('klant_id', id).maybeSingle().then(async ({ data }) => {
      const a = data as Afspraken | null
      if (!a) return
      setBedragen({
        uren: naarTekst(a.uren),
        uurtarief: naarTekst(a.uurtarief),
        prijsPerBeurt: naarTekst(a.prijs_per_beurt),
        contractbedrag: naarTekst(a.contractbedrag),
        urenPerBeurt: naarTekst(a.uren_per_beurt ?? null),
        contractBeurten: naarTekst(a.contract_beurten ?? null),
      })
      setAfgesprokenIn(a.contract_beurten != null ? 'beurten' : 'uren')
      setBeurtSchema({
        aan: a.beurten_aantal !== null,
        keer: String(a.beurten_keer ?? 1),
        aantal: String(a.beurten_aantal ?? 1),
        eenheid: a.beurten_eenheid ?? 'maand',
      })
      setTermijnen(a.termijnen ?? 1)
      setPeriode(a.periode)
      setStartdatum(a.startdatum ?? '')
      setEinddatum(a.einddatum ?? '')
      setPrijsafspraak(a.prijsafspraak ?? '')
      if (a.bestand_pad) {
        setBestand({ pad: a.bestand_pad, naam: a.bestand_naam ?? 'contract' })
        const links = await bekijkLinks('contracten', [a.bestand_pad])
        setBestandLink(links[a.bestand_pad] ?? null)
      }
    })
    void (async () => {
      const { data: werk } = await supabase.from('werkzaamheden').select('*').eq('klant_id', id).order('volgorde')
      const ids = ((werk as Werkzaamheid[]) ?? []).map((w) => w.id)
      const { data: prijzen } = ids.length
        ? await supabase.from('werkzaamheid_prijzen').select('*').in('werkzaamheid_id', ids)
        : { data: [] }
      const perTaak = new Map(((prijzen as WerkPrijs[]) ?? []).map((p) => [p.werkzaamheid_id, p]))
      setTaken(
        ((werk as Werkzaamheid[]) ?? []).map((w) => {
          const p = perTaak.get(w.id)
          return nieuweTaak({
            id: w.id,
            omschrijving: w.omschrijving,
            actief: w.actief,
            hoeVaak: w.wanneer_nodig ? 'nodig' : w.interval_aantal ? 'schema' : 'beurt',
            keer: String(w.keer ?? 1),
            aantal: String(w.interval_aantal ?? 1),
            eenheid: w.interval_eenheid ?? 'maand',
            meeteenheid: w.meeteenheid ?? '',
            prijsType: p?.prijs_type ?? 'inbegrepen',
            bedrag: naarTekst(p?.bedrag ?? null),
            uren: naarTekst(p?.uren_per_keer ?? null),
            hoeveelheid: naarTekst(p?.verwachte_hoeveelheid ?? null),
          })
        }),
      )
    })()
  }, [id])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    setFout('')
    const uren = naarGetal(bedragen.uren)
    const uurtarief = naarGetal(bedragen.uurtarief)
    const prijsPerBeurt = naarGetal(bedragen.prijsPerBeurt)
    const contractbedrag = naarGetal(bedragen.contractbedrag)
    const urenPerBeurt = naarGetal(bedragen.urenPerBeurt)
    const contractBeurten = naarGetal(bedragen.contractBeurten)
    const geldig = taken.filter((t) => t.omschrijving.trim())
    const taakGetallen = geldig.flatMap((t) => [t.bedrag, t.uren, t.hoeveelheid].map(naarGetal))
    if ([uren, uurtarief, prijsPerBeurt, contractbedrag, urenPerBeurt, contractBeurten, ...taakGetallen].includes('fout')) {
      setFout('Vul uren en bedragen in als getal, bijvoorbeeld 42,50.')
      return
    }
    if (contractvorm === 'vast_contract' && afgesprokenIn === 'beurten' && !heelGetal(bedragen.contractBeurten, 1, 999)) {
      setFout('Vul het aantal beurten in als heel getal.')
      return
    }
    const schemas = [...geldig.filter((t) => t.hoeVaak === 'schema'), ...(beurtSchema.aan ? [beurtSchema] : [])]
    if (schemas.some((t) => !heelGetal(t.keer, 1, 31) || !heelGetal(t.aantal, 1, 99))) {
      setFout('Vul bij "hoe vaak" hele getallen in, bijvoorbeeld 2 keer per 1 maand.')
      return
    }
    if (geldig.some((t) => t.prijsType === 'per_eenheid' && !t.meeteenheid.trim())) {
      setFout('Vul bij prijs per eenheid in welke eenheid het is, bijvoorbeeld m³.')
      return
    }

    setBezig(true)
    try {
      const gegevens = {
        naam: naam.trim(),
        adres: adres.trim() || null,
        telefoon: telefoon.trim() || null,
        contactpersoon: contactpersoon.trim() || null,
        notities: notities.trim() || null,
        actief,
        contractvorm,
      }
      const { data, error } = nieuw
        ? await supabase.from('klanten').insert(gegevens).select('id').single()
        : await supabase.from('klanten').update(gegevens).eq('id', id!).select('id').single()
      if (error) throw error
      const klantId = data.id as string

      let bestandGegevens = bestand
      if (nieuwBestand) {
        const pad = `${klantId}/${crypto.randomUUID()}-${nieuwBestand.name.replace(/[^\w.-]+/g, '_')}`
        const { error: eb } = await supabase.storage.from('contracten').upload(pad, nieuwBestand)
        if (eb) throw eb
        if (bestand) await supabase.storage.from('contracten').remove([bestand.pad])
        bestandGegevens = { pad, naam: nieuwBestand.name }
      }

      const { error: e2 } = await supabase.from('contracten').upsert({
        klant_id: klantId,
        uren: vast && afgesprokenIn === 'uren' ? uren : null,
        contract_beurten: vast && afgesprokenIn === 'beurten' ? contractBeurten : null,
        periode,
        contractbedrag: vast ? contractbedrag : null,
        startdatum: vast ? startdatum || null : null,
        einddatum: vast ? einddatum || null : null,
        uurtarief,
        prijs_per_beurt: vast ? null : prijsPerBeurt,
        prijsafspraak: prijsafspraak.trim() || null,
        beurten_keer: beurtSchema.aan ? Number(beurtSchema.keer) : null,
        beurten_aantal: beurtSchema.aan ? Number(beurtSchema.aantal) : null,
        beurten_eenheid: beurtSchema.aan ? beurtSchema.eenheid : null,
        uren_per_beurt: urenPerBeurt,
        termijnen,
        bestand_pad: bestandGegevens?.pad ?? null,
        bestand_naam: bestandGegevens?.naam ?? null,
      })
      if (e2) throw e2

      if (verwijderd.length) {
        const { error: ev } = await supabase.from('werkzaamheden').delete().in('id', verwijderd)
        if (ev) throw ev
      }
      for (const [volgorde, t] of geldig.entries()) {
        const schema = t.hoeVaak === 'schema'
        const rij = {
          klant_id: klantId,
          omschrijving: t.omschrijving.trim(),
          keer: schema ? Number(t.keer) : 1,
          interval_aantal: schema ? Number(t.aantal) : null,
          interval_eenheid: schema ? t.eenheid : null,
          wanneer_nodig: t.hoeVaak === 'nodig',
          meeteenheid: t.prijsType === 'per_eenheid' ? t.meeteenheid.trim() : null,
          actief: t.actief,
          volgorde,
        }
        const { data: w, error: e3 } = t.id
          ? await supabase.from('werkzaamheden').update(rij).eq('id', t.id).select('id').single()
          : await supabase.from('werkzaamheden').insert(rij).select('id').single()
        if (e3) throw e3
        const { error: e4 } = await supabase.from('werkzaamheid_prijzen').upsert({
          werkzaamheid_id: w.id as string,
          prijs_type: t.prijsType,
          bedrag: t.prijsType === 'inbegrepen' ? null : getal(t.bedrag),
          uren_per_keer: getal(t.uren),
          verwachte_hoeveelheid: t.prijsType === 'per_eenheid' ? getal(t.hoeveelheid) : null,
        })
        if (e4) throw e4
      }
      navigate(`/klanten/${klantId}`, { replace: true, state: { melding: 'Klant opgeslagen.' } })
    } catch (fout) {
      console.error(fout)
      setFout('Opslaan lukte niet. Probeer het opnieuw.')
      setBezig(false)
    }
  }

  function wijzigTaak(i: number, wijziging: Partial<TaakInvoer>) {
    setTaken(taken.map((t, j) => (j === i ? { ...t, ...wijziging } : t)))
  }

  function verwijderTaak(i: number) {
    const t = taken[i]
    if (t.id) {
      const tekst = `"${t.omschrijving || 'Deze werkzaamheid'}" verwijderen? Eerdere bezoeken blijven bewaard. Wil je hem alleen tijdelijk niet tonen, kies dan Uitzetten.`
      if (!window.confirm(tekst)) return
      setVerwijderd([...verwijderd, t.id])
    }
    setTaken(taken.filter((_, j) => j !== i))
  }

  // Dezelfde gegevens als na opslaan, voor de berekening onderaan het formulier.
  const vast = contractvorm === 'vast_contract'
  const concept: Afspraken = {
    klant_id: id ?? '',
    uren: vast && afgesprokenIn === 'uren' ? getal(bedragen.uren) : null,
    contract_beurten: vast && afgesprokenIn === 'beurten' && heelGetal(bedragen.contractBeurten, 1, 999) ? Number(bedragen.contractBeurten) : null,
    periode,
    uurtarief: getal(bedragen.uurtarief),
    prijs_per_beurt: vast ? null : getal(bedragen.prijsPerBeurt),
    contractbedrag: vast ? getal(bedragen.contractbedrag) : null,
    startdatum: vast ? startdatum || null : null,
    einddatum: vast ? einddatum || null : null,
    prijsafspraak: null,
    bestand_pad: null,
    bestand_naam: null,
    beurten_keer: beurtSchema.aan && heelGetal(beurtSchema.keer, 1, 31) ? Number(beurtSchema.keer) : null,
    beurten_aantal: beurtSchema.aan && heelGetal(beurtSchema.aantal, 1, 99) ? Number(beurtSchema.aantal) : null,
    beurten_eenheid: beurtSchema.aan ? beurtSchema.eenheid : null,
    uren_per_beurt: getal(bedragen.urenPerBeurt),
    termijnen,
  }
  const conceptTaken: Werkzaamheid[] = taken
    .filter((t) => t.omschrijving.trim())
    .map((t, i) => {
      const schema = t.hoeVaak === 'schema' && heelGetal(t.keer, 1, 31) && heelGetal(t.aantal, 1, 99)
      return {
        id: `t${i}`,
        klant_id: id ?? '',
        omschrijving: t.omschrijving,
        keer: schema ? Number(t.keer) : 1,
        interval_aantal: schema ? Number(t.aantal) : null,
        interval_eenheid: schema ? t.eenheid : null,
        wanneer_nodig: t.hoeVaak === 'nodig',
        meeteenheid: t.meeteenheid || null,
        volgorde: i,
        actief: t.actief,
      }
    })
  const conceptPrijzen: Record<string, WerkPrijs> = Object.fromEntries(
    taken
      .filter((t) => t.omschrijving.trim())
      .map((t, i) => [
        `t${i}`,
        {
          werkzaamheid_id: `t${i}`,
          prijs_type: t.prijsType,
          bedrag: getal(t.bedrag),
          uren_per_keer: getal(t.uren),
          verwachte_hoeveelheid: getal(t.hoeveelheid),
        },
      ]),
  )

  function bedragVeld(sleutel: keyof typeof leeg, label: string, placeholder: string) {
    return (
      <label>
        {label}
        <input
          inputMode="decimal"
          placeholder={placeholder}
          value={bedragen[sleutel]}
          onChange={(e) => setBedragen({ ...bedragen, [sleutel]: e.target.value })}
        />
      </label>
    )
  }

  return (
    <main className="pagina">
      <Link to={nieuw ? '/' : `/klanten/${id}`} className="terug">← Terug</Link>
      <h1>{nieuw ? 'Nieuwe klant' : 'Klant bewerken'}</h1>
      <form onSubmit={opslaan} className="formulier">
        <label>
          Naam
          <input required value={naam} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <label>
          Adres
          <input value={adres} onChange={(e) => setAdres(e.target.value)} />
        </label>
        <div className="twee">
          <label>
            Contactpersoon
            <input value={contactpersoon} onChange={(e) => setContactpersoon(e.target.value)} placeholder="Bijv. Jan de Vries" />
          </label>
          <label>
            Telefoon
            <input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} />
          </label>
        </div>
        <label>
          Notities voor medewerkers
          <textarea rows={2} value={notities} onChange={(e) => setNotities(e.target.value)} placeholder="Bijv. sleutel ligt onder de mat" />
        </label>

        <fieldset>
          <legend>Werkzaamheden</legend>
          <p className="klein">Per werkzaamheid: hoe vaak, hoeveel uur en of er een eigen prijs voor is.</p>
          {taken.map((t, i) => (
            <div key={t.id ?? `nieuw-${i}`} className={`taakrij ${t.actief ? '' : 'gedimd'}`}>
              <div className="rij">
                <input value={t.omschrijving} aria-label="Omschrijving" placeholder="Bijv. gras maaien" onChange={(e) => wijzigTaak(i, { omschrijving: e.target.value })} />
              </div>
              <label>
                Hoe vaak
                <select value={t.hoeVaak} onChange={(e) => wijzigTaak(i, { hoeVaak: e.target.value as HoeVaak })}>
                  <option value="beurt">Elke beurt</option>
                  <option value="schema">Vast schema (bijv. 2 keer per maand)</option>
                  <option value="nodig">Alleen als het nodig is</option>
                </select>
              </label>
              {t.hoeVaak === 'schema' && (
                <SchemaVelden keer={t.keer} aantal={t.aantal} eenheid={t.eenheid} wijzig={(w) => wijzigTaak(i, w)} />
              )}
              <div className="twee">
                <label>
                  Prijs
                  <select value={t.prijsType} onChange={(e) => wijzigTaak(i, { prijsType: e.target.value as PrijsType })}>
                    <option value="inbegrepen">Inbegrepen (geen eigen prijs)</option>
                    <option value="per_keer">Vast bedrag per keer</option>
                    <option value="per_uur">Per uur</option>
                    <option value="per_eenheid">Per eenheid (bijv. m³ groenafval)</option>
                  </select>
                </label>
                <label>
                  Uren per keer
                  <input inputMode="decimal" placeholder="Bijv. 1,5" value={t.uren} onChange={(e) => wijzigTaak(i, { uren: e.target.value })} />
                </label>
              </div>
              {t.prijsType === 'per_eenheid' && (
                <div className="drie">
                  <label>
                    Eenheid
                    <input placeholder="m³" value={t.meeteenheid} onChange={(e) => wijzigTaak(i, { meeteenheid: e.target.value })} />
                  </label>
                  <label>
                    Prijs per {t.meeteenheid || 'eenheid'} (€)
                    <input inputMode="decimal" placeholder="Bijv. 35" value={t.bedrag} onChange={(e) => wijzigTaak(i, { bedrag: e.target.value })} />
                  </label>
                  <label>
                    Verwacht per keer
                    <input inputMode="decimal" placeholder="Bijv. 2" value={t.hoeveelheid} onChange={(e) => wijzigTaak(i, { hoeveelheid: e.target.value })} />
                  </label>
                </div>
              )}
              {(t.prijsType === 'per_keer' || t.prijsType === 'per_uur') && (
                <label>
                  {t.prijsType === 'per_keer' ? 'Bedrag per keer (€)' : 'Uurtarief voor dit werk (€)'}
                  <input inputMode="decimal" placeholder={t.prijsType === 'per_keer' ? 'Bijv. 60' : 'Bijv. 45'} value={t.bedrag} onChange={(e) => wijzigTaak(i, { bedrag: e.target.value })} />
                </label>
              )}
              {t.prijsType === 'per_eenheid' && (
                <p className="klein">Bij het bezoek vult de medewerker in hoeveel {t.meeteenheid || 'eenheden'} het was. De app rekent het bedrag uit.</p>
              )}
              <div className="rij knoppen">
                {t.id && (
                  <button type="button" className="link" onClick={() => wijzigTaak(i, { actief: !t.actief })}>
                    {t.actief ? 'Uitzetten' : 'Aanzetten'}
                  </button>
                )}
                <button type="button" className="link gevaar" onClick={() => verwijderTaak(i)}>
                  Verwijderen
                </button>
              </div>
            </div>
          ))}
          <div className="rij knoppen">
            <button type="button" className="link" onClick={() => setTaken([...taken, nieuweTaak()])}>
              + Werkzaamheid toevoegen
            </button>
            <button
              type="button"
              className="link"
              onClick={() =>
                setTaken([
                  ...taken,
                  nieuweTaak({ omschrijving: 'Groenafval afvoeren', hoeVaak: 'nodig', prijsType: 'per_eenheid', meeteenheid: 'm³' }),
                ])
              }
            >
              + Groenafval per m³
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Prijsafspraken en contract</legend>
          <p className="klein">Alleen beheerders zien dit deel.</p>
          <label className="vinkje">
            <input type="radio" checked={contractvorm === 'per_beurt'} onChange={() => setContractvorm('per_beurt')} />
            Factureren per beurt
          </label>
          <label className="vinkje">
            <input type="radio" checked={contractvorm === 'vast_contract'} onChange={() => setContractvorm('vast_contract')} />
            Vast contract
          </label>

          <label>
            Hoe vaak komen we
            <select value={beurtSchema.aan ? 'schema' : 'geen'} onChange={(e) => setBeurtSchema({ ...beurtSchema, aan: e.target.value === 'schema' })}>
              <option value="geen">Geen vast schema</option>
              <option value="schema">Vast schema (bijv. 2 keer per maand)</option>
            </select>
          </label>
          {beurtSchema.aan && (
            <SchemaVelden keer={beurtSchema.keer} aantal={beurtSchema.aantal} eenheid={beurtSchema.eenheid}
              wijzig={(w) => setBeurtSchema({ ...beurtSchema, ...w })} />
          )}
          {bedragVeld('urenPerBeurt', 'Uren per beurt', 'Bijv. 3')}

          {vast ? (
            <>
              <label>
                Afgesproken in
                <select value={afgesprokenIn} onChange={(e) => setAfgesprokenIn(e.target.value as 'uren' | 'beurten')}>
                  <option value="uren">Uren</option>
                  <option value="beurten">Beurten</option>
                </select>
              </label>
              <div className="twee">
                {afgesprokenIn === 'uren'
                  ? bedragVeld('uren', 'Contracturen', 'Bijv. 8')
                  : bedragVeld('contractBeurten', 'Aantal beurten', 'Bijv. 2')}
                <label>
                  Per
                  <select value={periode} onChange={(e) => setPeriode(e.target.value as 'maand' | 'jaar')}>
                    <option value="maand">maand</option>
                    <option value="jaar">jaar</option>
                  </select>
                </label>
              </div>
              {bedragVeld('contractbedrag', `Contractbedrag per ${periode} (€)`, 'Bijv. 350')}
              {bedragVeld('uurtarief', 'Uurtarief voor meerwerk (€)', 'Bijv. 45')}
              <div className="twee">
                <label>
                  Startdatum
                  <input type="date" value={startdatum} onChange={(e) => setStartdatum(e.target.value)} />
                </label>
                <label>
                  Einddatum
                  <input type="date" value={einddatum} onChange={(e) => setEinddatum(e.target.value)} />
                </label>
              </div>
            </>
          ) : (
            <div className="twee">
              {bedragVeld('prijsPerBeurt', 'Vaste prijs per beurt (€)', 'Bijv. 130')}
              {bedragVeld('uurtarief', 'Of uurtarief (€)', 'Bijv. 45')}
            </div>
          )}

          <label>
            Factureren
            <select value={termijnen} onChange={(e) => setTermijnen(Number(e.target.value))}>
              {Object.entries(termijnLabel).map(([n, label]) => (
                <option key={n} value={n}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Overige afspraken
            <textarea rows={2} value={prijsafspraak} onChange={(e) => setPrijsafspraak(e.target.value)} placeholder="Bijv. sleutel bij de buren, niet op woensdag" />
          </label>
          <label>
            Contract (pdf of foto)
            {bestand && (
              <span className="klein">
                Huidig: {bestandLink ? <a href={bestandLink} target="_blank" rel="noreferrer">{bestand.naam}</a> : bestand.naam}
              </span>
            )}
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setNieuwBestand(e.target.files?.[0] ?? null)} />
          </label>
        </fieldset>

        <fieldset>
          <legend>Prijsopbouw</legend>
          <p className="klein">Zo rekent de app het uit met wat je hierboven invult.</p>
          <PrijsopbouwTabel contractvorm={contractvorm} afspraken={concept} taken={conceptTaken} prijzen={conceptPrijzen} />
        </fieldset>

        <label className="vinkje">
          <input type="checkbox" checked={actief} onChange={(e) => setActief(e.target.checked)} />
          Actieve klant
        </label>

        {fout && <p className="fout">{fout}</p>}
        <button className="groot" disabled={bezig}>{bezig ? 'Bezig…' : 'Opslaan'}</button>
      </form>
    </main>
  )
}
