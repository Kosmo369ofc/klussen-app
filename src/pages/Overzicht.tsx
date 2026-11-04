import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dagenGeleden, toonDatum, vandaag } from '../lib/datum'
import { volgendeKeer, type Klant, type Werkzaamheid } from '../lib/types'

interface Rij {
  klant: Klant
  laatste: string | null
  nodig: string[]
}

// Per klant de laatste beurt, langst geleden bovenaan, en welk werk weer nodig is.
export default function Overzicht() {
  const [rijen, setRijen] = useState<Rij[] | null>(null)

  useEffect(() => {
    void (async () => {
      const [klanten, laatsteBeurt, taken, takenLaatst] = await Promise.all([
        supabase.from('klanten').select('*').eq('actief', true),
        supabase.from('klant_laatste_beurt').select('klant_id, laatste_datum'),
        supabase.from('werkzaamheden').select('*').eq('actief', true),
        supabase.from('werkzaamheid_laatst_gedaan').select('werkzaamheid_id, laatste_datum'),
      ])
      const beurt = new Map((laatsteBeurt.data ?? []).map((r) => [r.klant_id as string, r.laatste_datum as string | null]))
      const taakLaatst = new Map(
        (takenLaatst.data ?? []).map((r) => [r.werkzaamheid_id as string, r.laatste_datum as string | null]),
      )
      const nu = vandaag()
      const lijst = ((klanten.data as Klant[]) ?? []).map((klant) => ({
        klant,
        laatste: beurt.get(klant.id) ?? null,
        nodig: ((taken.data as Werkzaamheid[]) ?? [])
          .filter((t) => t.klant_id === klant.id)
          .filter((t) => {
            const volgende = volgendeKeer(t, taakLaatst.get(t.id) ?? null)
            return volgende !== null && volgende <= nu
          })
          .map((t) => t.omschrijving),
      }))
      lijst.sort((a, b) => (a.laatste ?? '').localeCompare(b.laatste ?? '') || a.klant.naam.localeCompare(b.klant.naam))
      setRijen(lijst)
    })()
  }, [])

  return (
    <main className="pagina">
      <h1>Laatste beurt per klant</h1>
      <p className="klein">Langst geleden bovenaan.</p>
      {rijen === null ? (
        <p>Laden…</p>
      ) : rijen.length === 0 ? (
        <p>Nog geen klanten.</p>
      ) : (
        <table className="tabel">
          <thead>
            <tr>
              <th>Klant</th>
              <th>Laatste beurt</th>
              <th>Geleden</th>
              <th>Weer nodig</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map(({ klant, laatste, nodig }) => (
              <tr key={klant.id}>
                <td><Link to={`/klanten/${klant.id}`}>{klant.naam}</Link></td>
                <td>{laatste ? toonDatum(laatste) : 'Nog nooit'}</td>
                <td>{laatste ? `${dagenGeleden(laatste)} dagen` : '–'}</td>
                <td className={nodig.length ? 'nodig' : ''}>{nodig.join(', ') || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
