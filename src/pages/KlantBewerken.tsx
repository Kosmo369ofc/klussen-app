import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { bekijkLinks } from '../lib/bestanden'
import type { Afspraken, Contractvorm, IntervalEenheid, Klant, Werkzaamheid } from '../lib/types'

type TaakInvoer = Pick<Werkzaamheid, 'omschrijving' | 'actief'> & {
  id?: string
  // '' betekent elke beurt.
  aantal: string
  eenheid: IntervalEenheid
}

// Tekstvelden voor bedragen en uren; leeg betekent: niet ingevuld.
const leeg = { uren: '', uurtarief: '', prijsPerBeurt: '', contractbedrag: '' }

function naarTekst(n: number | null): string {
  return n === null ? '' : String(n).replace('.', ',')
}

function naarGetal(tekst: string): number | null | 'fout' {
  if (!tekst.trim()) return null
  const n = Number(tekst.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 'fout'
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
  const [taken, setTaken] = useState<TaakInvoer[]>([])
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
      })
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
    supabase
      .from('werkzaamheden')
      .select('*')
      .eq('klant_id', id)
      .order('volgorde')
      .then(({ data }) =>
        setTaken(
          ((data as Werkzaamheid[]) ?? []).map((w) => ({
            id: w.id,
            omschrijving: w.omschrijving,
            actief: w.actief,
            aantal: w.interval_aantal ? String(w.interval_aantal) : '',
            eenheid: w.interval_eenheid ?? 'maand',
          })),
        ),
      )
  }, [id])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    setFout('')
    const uren = naarGetal(bedragen.uren)
    const uurtarief = naarGetal(bedragen.uurtarief)
    const prijsPerBeurt = naarGetal(bedragen.prijsPerBeurt)
    const contractbedrag = naarGetal(bedragen.contractbedrag)
    if ([uren, uurtarief, prijsPerBeurt, contractbedrag].includes('fout')) {
      setFout('Vul uren en bedragen in als getal, bijvoorbeeld 42,50.')
      return
    }
    if (contractvorm === 'vast_contract' && uren === null) {
      setFout('Vul de contracturen in.')
      return
    }
    const geldig = taken.filter((t) => t.omschrijving.trim())
    if (geldig.some((t) => t.aantal && !(Number(t.aantal) >= 1 && Number(t.aantal) <= 99))) {
      setFout('Een interval moet een heel getal van 1 tot en met 99 zijn.')
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

      const vast = contractvorm === 'vast_contract'
      const { error: e2 } = await supabase.from('contracten').upsert({
        klant_id: klantId,
        uren: vast ? uren : null,
        periode,
        contractbedrag: vast ? contractbedrag : null,
        startdatum: vast ? startdatum || null : null,
        einddatum: vast ? einddatum || null : null,
        uurtarief,
        prijs_per_beurt: prijsPerBeurt,
        prijsafspraak: prijsafspraak.trim() || null,
        bestand_pad: bestandGegevens?.pad ?? null,
        bestand_naam: bestandGegevens?.naam ?? null,
      })
      if (e2) throw e2

      for (const [volgorde, t] of geldig.entries()) {
        const rij = {
          klant_id: klantId,
          omschrijving: t.omschrijving.trim(),
          interval_aantal: t.aantal ? Number(t.aantal) : null,
          interval_eenheid: t.aantal ? t.eenheid : null,
          actief: t.actief,
          volgorde,
        }
        const { error: e3 } = t.id
          ? await supabase.from('werkzaamheden').update(rij).eq('id', t.id)
          : await supabase.from('werkzaamheden').insert(rij)
        if (e3) throw e3
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
          <p className="klein">Kies per werkzaamheid hoe vaak die nodig is. Laat het getal leeg voor elke beurt.</p>
          {taken.map((t, i) => (
            <div key={t.id ?? `nieuw-${i}`} className={`taakrij ${t.actief ? '' : 'gedimd'}`}>
              <input value={t.omschrijving} placeholder="Bijv. gras maaien" onChange={(e) => wijzigTaak(i, { omschrijving: e.target.value })} />
              <div className="rij">
                <span>Elke</span>
                <input
                  inputMode="numeric"
                  className="uren"
                  placeholder="beurt"
                  value={t.aantal}
                  onChange={(e) => wijzigTaak(i, { aantal: e.target.value.replace(/\D/g, '') })}
                />
                {t.aantal && (
                  <select value={t.eenheid} onChange={(e) => wijzigTaak(i, { eenheid: e.target.value as IntervalEenheid })}>
                    <option value="week">{t.aantal === '1' ? 'week' : 'weken'}</option>
                    <option value="maand">{t.aantal === '1' ? 'maand' : 'maanden'}</option>
                    <option value="jaar">jaar</option>
                  </select>
                )}
                {t.id ? (
                  <button type="button" className="link" onClick={() => wijzigTaak(i, { actief: !t.actief })}>
                    {t.actief ? 'Uitzetten' : 'Aanzetten'}
                  </button>
                ) : (
                  <button type="button" className="link" onClick={() => setTaken(taken.filter((_, j) => j !== i))}>
                    Weg
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="link"
            onClick={() => setTaken([...taken, { omschrijving: '', aantal: '', eenheid: 'maand', actief: true }])}
          >
            + Werkzaamheid toevoegen
          </button>
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
          {contractvorm === 'vast_contract' && (
            <>
              <div className="twee">
                {bedragVeld('uren', 'Contracturen', 'Bijv. 8')}
                <label>
                  Per
                  <select value={periode} onChange={(e) => setPeriode(e.target.value as 'maand' | 'jaar')}>
                    <option value="maand">maand</option>
                    <option value="jaar">jaar</option>
                  </select>
                </label>
              </div>
              {bedragVeld('contractbedrag', `Contractbedrag per ${periode} (€)`, 'Bijv. 350')}
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
          )}
          <div className="twee">
            {bedragVeld('uurtarief', 'Uurtarief (€)', 'Bijv. 45')}
            {bedragVeld('prijsPerBeurt', 'Vaste prijs per beurt (€)', 'Bijv. 120')}
          </div>
          <label>
            Overige prijsafspraken
            <textarea rows={2} value={prijsafspraak} onChange={(e) => setPrijsafspraak(e.target.value)} placeholder="Bijv. groenafval apart, € 25 per keer" />
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
