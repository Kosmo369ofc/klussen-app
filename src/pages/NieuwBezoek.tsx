import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { vandaag } from '../lib/datum'
import { bezoekOpslaan } from '../lib/wachtrij'
import { fotosUploaden } from '../lib/bestanden'
import type { Klant, Medewerker, Werkzaamheid } from '../lib/types'

interface UrenRegel {
  medewerker_id: string
  uren: string
}

export default function NieuwBezoek() {
  const { id: klantId } = useParams()
  const { medewerker } = useAuth()
  const navigate = useNavigate()
  const [klant, setKlant] = useState<Klant | null>(null)
  const [taken, setTaken] = useState<Werkzaamheid[]>([])
  const [collegas, setCollegas] = useState<Medewerker[]>([])

  const [datum, setDatum] = useState(vandaag())
  const [gedaan, setGedaan] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState<string[]>([''])
  const [uren, setUren] = useState<UrenRegel[]>([{ medewerker_id: medewerker?.id ?? '', uren: '' }])
  const [opmerkingen, setOpmerkingen] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  useEffect(() => {
    if (!klantId) return
    supabase.from('klanten').select('*').eq('id', klantId).single().then(({ data }) => setKlant(data as Klant))
    supabase
      .from('werkzaamheden')
      .select('*')
      .eq('klant_id', klantId)
      .eq('actief', true)
      .order('volgorde')
      .then(({ data }) => setTaken((data as Werkzaamheid[]) ?? []))
    supabase
      .from('medewerkers')
      .select('*')
      .eq('actief', true)
      .order('naam')
      .then(({ data }) => setCollegas((data as Medewerker[]) ?? []))
  }, [klantId])

  function wisselTaak(id: string) {
    const nieuw = new Set(gedaan)
    if (nieuw.has(id)) nieuw.delete(id)
    else nieuw.add(id)
    setGedaan(nieuw)
  }

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    setFout('')
    const urenLijst = uren
      .filter((u) => u.medewerker_id && u.uren.trim())
      .map((u) => ({ medewerker_id: u.medewerker_id, uren: Number(u.uren.replace(',', '.')) }))
    if (urenLijst.some((u) => !Number.isFinite(u.uren) || u.uren < 0 || u.uren > 24)) {
      setFout('Vul de uren in als getal, bijvoorbeeld 2,5.')
      return
    }
    if (new Set(urenLijst.map((u) => u.medewerker_id)).size !== urenLijst.length) {
      setFout('Elke medewerker mag maar één keer bij de uren staan.')
      return
    }
    const regels = [
      ...taken.filter((t) => gedaan.has(t.id)).map((t) => ({ werkzaamheid_id: t.id, omschrijving: t.omschrijving })),
      ...extra.map((x) => x.trim()).filter(Boolean).map((x) => ({ werkzaamheid_id: null, omschrijving: x })),
    ]
    if (regels.length === 0) {
      setFout('Vink minstens één werkzaamheid aan of beschrijf het extra werk.')
      return
    }
    if (urenLijst.length === 0) {
      setFout('Vul in hoeveel uur er gewerkt is.')
      return
    }

    setBezig(true)
    try {
      const bezoekId = crypto.randomUUID()
      const resultaat = await bezoekOpslaan({
        id: bezoekId,
        klant_id: klantId!,
        datum,
        opmerkingen,
        uren: urenLijst,
        regels,
      })
      let melding = 'Bezoek opgeslagen.'
      if (resultaat === 'bewaard') {
        melding = 'Geen internet: het bezoek is op deze telefoon bewaard en wordt verstuurd zodra er weer verbinding is.'
        if (fotos.length) melding += " Foto's kunnen alleen met internet worden meegestuurd."
      } else if (fotos.length) {
        const mislukt = await fotosUploaden(bezoekId, fotos)
        if (mislukt) melding = `Bezoek opgeslagen, maar ${mislukt} van de ${fotos.length} foto's kon niet worden geüpload.`
      }
      navigate(`/klanten/${klantId}`, { replace: true, state: { melding } })
    } catch {
      setFout('Opslaan lukte niet. Probeer het opnieuw of meld het aan de beheerder.')
      setBezig(false)
    }
  }

  return (
    <main className="pagina">
      <Link to={`/klanten/${klantId}`} className="terug">← {klant?.naam ?? 'Klant'}</Link>
      <h1>Bezoek invoeren</h1>
      <form onSubmit={opslaan} className="formulier">
        <label>
          Datum
          <input type="date" required value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>

        <fieldset>
          <legend>Wat is er gedaan?</legend>
          {taken.map((t) => (
            <label key={t.id} className="vinkje">
              <input type="checkbox" checked={gedaan.has(t.id)} onChange={() => wisselTaak(t.id)} />
              {t.omschrijving}
            </label>
          ))}
          {extra.map((x, i) => (
            <input
              key={i}
              placeholder={i === 0 ? 'Extra werk, bijvoorbeeld bladblazen' : 'Nog meer extra werk'}
              value={x}
              onChange={(e) => {
                const nieuw = [...extra]
                nieuw[i] = e.target.value
                if (i === extra.length - 1 && e.target.value) nieuw.push('')
                setExtra(nieuw)
              }}
            />
          ))}
        </fieldset>

        <fieldset>
          <legend>Uren</legend>
          {uren.map((u, i) => (
            <div key={i} className="rij">
              <select
                value={u.medewerker_id}
                onChange={(e) => setUren(uren.map((x, j) => (j === i ? { ...x, medewerker_id: e.target.value } : x)))}
              >
                <option value="">Kies medewerker</option>
                {collegas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.naam}
                  </option>
                ))}
              </select>
              <input
                inputMode="decimal"
                placeholder="uren"
                className="uren"
                value={u.uren}
                onChange={(e) => setUren(uren.map((x, j) => (j === i ? { ...x, uren: e.target.value } : x)))}
              />
              {uren.length > 1 && (
                <button type="button" className="link" onClick={() => setUren(uren.filter((_, j) => j !== i))}>
                  Weg
                </button>
              )}
            </div>
          ))}
          <button type="button" className="link" onClick={() => setUren([...uren, { medewerker_id: '', uren: '' }])}>
            + Collega toevoegen
          </button>
        </fieldset>

        <label>
          Opmerkingen
          <textarea rows={3} value={opmerkingen} onChange={(e) => setOpmerkingen(e.target.value)} />
        </label>

        <label>
          Foto's van het resultaat
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFotos([...fotos, ...Array.from(e.target.files ?? [])])}
          />
        </label>
        {fotos.length > 0 && (
          <p className="klein">
            {fotos.length === 1 ? '1 foto gekozen' : `${fotos.length} foto's gekozen`}.{' '}
            <button type="button" className="link" onClick={() => setFotos([])}>Weghalen</button>
          </p>
        )}

        {fout && <p className="fout">{fout}</p>}
        <button className="groot" disabled={bezig}>
          {bezig ? 'Bezig…' : 'Bezoek opslaan'}
        </button>
      </form>
    </main>
  )
}
