import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { frequentieLabel, type Contractvorm, type Frequentie, type Klant, type Werkzaamheid } from '../lib/types'

type TaakInvoer = Pick<Werkzaamheid, 'omschrijving' | 'frequentie' | 'actief'> & { id?: string }

const frequenties = Object.keys(frequentieLabel) as Frequentie[]

export default function KlantBewerken() {
  const { id } = useParams()
  const nieuw = !id
  const navigate = useNavigate()
  const [naam, setNaam] = useState('')
  const [adres, setAdres] = useState('')
  const [telefoon, setTelefoon] = useState('')
  const [notities, setNotities] = useState('')
  const [actief, setActief] = useState(true)
  const [contractvorm, setContractvorm] = useState<Contractvorm>('per_beurt')
  const [contractUren, setContractUren] = useState('')
  const [periode, setPeriode] = useState<'maand' | 'jaar'>('maand')
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
      setNotities(k.notities ?? '')
      setActief(k.actief)
      setContractvorm(k.contractvorm)
    })
    supabase.from('contracten').select('*').eq('klant_id', id).maybeSingle().then(({ data }) => {
      if (data) {
        setContractUren(String(data.uren).replace('.', ','))
        setPeriode(data.periode)
      }
    })
    supabase
      .from('werkzaamheden')
      .select('*')
      .eq('klant_id', id)
      .order('volgorde')
      .then(({ data }) => setTaken((data as Werkzaamheid[]) ?? []))
  }, [id])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    setFout('')
    const uren = Number(contractUren.replace(',', '.'))
    if (contractvorm === 'vast_contract' && (!contractUren.trim() || !Number.isFinite(uren) || uren < 0)) {
      setFout('Vul de contracturen in als getal.')
      return
    }
    setBezig(true)
    try {
      const gegevens = {
        naam: naam.trim(),
        adres: adres.trim() || null,
        telefoon: telefoon.trim() || null,
        notities: notities.trim() || null,
        actief,
        contractvorm,
      }
      const { data, error } = nieuw
        ? await supabase.from('klanten').insert(gegevens).select('id').single()
        : await supabase.from('klanten').update(gegevens).eq('id', id!).select('id').single()
      if (error) throw error
      const klantId = data.id as string

      if (contractvorm === 'vast_contract') {
        const { error: e2 } = await supabase.from('contracten').upsert({ klant_id: klantId, uren, periode })
        if (e2) throw e2
      } else {
        await supabase.from('contracten').delete().eq('klant_id', klantId)
      }

      const geldig = taken.filter((t) => t.omschrijving.trim())
      for (const [volgorde, t] of geldig.entries()) {
        const rij = { klant_id: klantId, omschrijving: t.omschrijving.trim(), frequentie: t.frequentie, actief: t.actief, volgorde }
        const { error: e3 } = t.id
          ? await supabase.from('werkzaamheden').update(rij).eq('id', t.id)
          : await supabase.from('werkzaamheden').insert(rij)
        if (e3) throw e3
      }
      navigate(`/klanten/${klantId}`, { replace: true, state: { melding: 'Klant opgeslagen.' } })
    } catch {
      setFout('Opslaan lukte niet. Probeer het opnieuw.')
      setBezig(false)
    }
  }

  function wijzigTaak(i: number, wijziging: Partial<TaakInvoer>) {
    setTaken(taken.map((t, j) => (j === i ? { ...t, ...wijziging } : t)))
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
        <label>
          Telefoon
          <input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} />
        </label>
        <label>
          Notities voor medewerkers
          <textarea rows={2} value={notities} onChange={(e) => setNotities(e.target.value)} placeholder="Bijv. sleutel ligt onder de mat" />
        </label>

        <fieldset>
          <legend>Contract</legend>
          <label className="vinkje">
            <input type="radio" checked={contractvorm === 'per_beurt'} onChange={() => setContractvorm('per_beurt')} />
            Factureren per beurt
          </label>
          <label className="vinkje">
            <input type="radio" checked={contractvorm === 'vast_contract'} onChange={() => setContractvorm('vast_contract')} />
            Vast contract
          </label>
          {contractvorm === 'vast_contract' && (
            <div className="rij">
              <input inputMode="decimal" className="uren" placeholder="uren" value={contractUren} onChange={(e) => setContractUren(e.target.value)} />
              <span>uur per</span>
              <select value={periode} onChange={(e) => setPeriode(e.target.value as 'maand' | 'jaar')}>
                <option value="maand">maand</option>
                <option value="jaar">jaar</option>
              </select>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Werkzaamheden</legend>
          {taken.map((t, i) => (
            <div key={t.id ?? `nieuw-${i}`} className={`rij ${t.actief ? '' : 'gedimd'}`}>
              <input value={t.omschrijving} placeholder="Bijv. gras maaien" onChange={(e) => wijzigTaak(i, { omschrijving: e.target.value })} />
              <select value={t.frequentie} onChange={(e) => wijzigTaak(i, { frequentie: e.target.value as Frequentie })}>
                {frequenties.map((f) => (
                  <option key={f} value={f}>{frequentieLabel[f]}</option>
                ))}
              </select>
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
          ))}
          <button type="button" className="link" onClick={() => setTaken([...taken, { omschrijving: '', frequentie: 'elke_beurt', actief: true }])}>
            + Werkzaamheid toevoegen
          </button>
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
