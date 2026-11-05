import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dagenGeleden, toonDatum, vandaag } from '../lib/datum'
import { volgendeKeer, type Afspraken, type Klant, type Werkzaamheid } from '../lib/types'

interface Rij {
  klant: Klant
  laatste: string | null
  // Vroegste datum waarop er weer iets moet gebeuren, of null zonder schema.
  volgende: string | null
}

type Niveau = 'rood' | 'oranje' | 'geel' | 'groen' | 'grijs'

// Hoe dringend: rood = nu nodig of te laat, oranje = binnen een week, geel = binnen 2 weken.
function niveau(volgende: string): Niveau {
  const dagen = -dagenGeleden(volgende)
  if (dagen <= 0) return 'rood'
  if (dagen <= 7) return 'oranje'
  if (dagen <= 14) return 'geel'
  return 'groen'
}

function korteDatum(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })
}

// Per klant de laatste beurt, langst geleden bovenaan, en wanneer het weer nodig is.
export default function Overzicht() {
  const [rijen, setRijen] = useState<Rij[] | null>(null)

  useEffect(() => {
    void (async () => {
      const [klanten, laatsteBeurt, taken, takenLaatst, contracten] = await Promise.all([
        supabase.from('klanten').select('*').eq('actief', true),
        supabase.from('klant_laatste_beurt').select('klant_id, laatste_datum'),
        supabase.from('werkzaamheden').select('*').eq('actief', true),
        supabase.from('werkzaamheid_laatst_gedaan').select('werkzaamheid_id, laatste_datum'),
        // Alleen de beheerder kan dit lezen; voor medewerkers blijft het leeg.
        supabase.from('contracten').select('klant_id, beurten_keer, beurten_aantal, beurten_eenheid'),
      ])
      const beurt = new Map((laatsteBeurt.data ?? []).map((r) => [r.klant_id as string, r.laatste_datum as string | null]))
      const taakLaatst = new Map(
        (takenLaatst.data ?? []).map((r) => [r.werkzaamheid_id as string, r.laatste_datum as string | null]),
      )
      const schema = new Map(
        ((contracten.data as Pick<Afspraken, 'klant_id' | 'beurten_keer' | 'beurten_aantal' | 'beurten_eenheid'>[]) ?? []).map(
          (a) => [a.klant_id, a],
        ),
      )
      const lijst = ((klanten.data as Klant[]) ?? []).map((klant) => {
        const laatste = beurt.get(klant.id) ?? null
        const datums: string[] = []
        const a = schema.get(klant.id)
        if (a) {
          const d = volgendeKeer(
            { keer: a.beurten_keer ?? 1, interval_aantal: a.beurten_aantal, interval_eenheid: a.beurten_eenheid },
            laatste,
          )
          if (d) datums.push(d)
        }
        for (const t of (taken.data as Werkzaamheid[]) ?? []) {
          if (t.klant_id !== klant.id) continue
          // Nog nooit afgevinkt: reken vanaf de laatste beurt bij de klant.
          const d = volgendeKeer(t, taakLaatst.get(t.id) ?? laatste)
          if (d) datums.push(d)
        }
        datums.sort()
        return { klant, laatste, volgende: datums[0] ?? null }
      })
      lijst.sort((a, b) => (a.laatste ?? '').localeCompare(b.laatste ?? '') || a.klant.naam.localeCompare(b.klant.naam))
      setRijen(lijst)
    })()
  }, [])

  const nu = vandaag()

  return (
    <main className="pagina breed">
      <h1>Laatste beurt per klant</h1>
      <p className="klein">Langst geleden bovenaan.</p>
      {rijen === null ? (
        <p>Laden…</p>
      ) : rijen.length === 0 ? (
        <p>Nog geen klanten.</p>
      ) : (
        <>
          <table className="tabel overzicht">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Laatste beurt</th>
                <th>Geleden</th>
                <th>Weer nodig</th>
              </tr>
            </thead>
            <tbody>
              {rijen.map(({ klant, laatste, volgende }) => (
                <tr key={klant.id}>
                  <td>
                    <Link className="pil klantpil" to={`/klanten/${klant.id}`}>{klant.naam}</Link>
                  </td>
                  <td>{laatste ? toonDatum(laatste) : 'Nog nooit'}</td>
                  <td>{laatste ? `${dagenGeleden(laatste)} dagen` : '–'}</td>
                  <td>
                    {!laatste ? (
                      <span className="pil grijs">Na eerste beurt</span>
                    ) : volgende ? (
                      <span className={`pil ${niveau(volgende)}`} title={toonDatum(volgende)}>
                        {volgende <= nu ? 'Nu nodig' : korteDatum(volgende)}
                      </span>
                    ) : (
                      <span className="klein" title="Geen interval ingesteld bij deze klant">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="legenda klein">
            Kleuren: <span className="pil rood">Nu nodig / te laat</span> <span className="pil oranje">Binnen een week</span>{' '}
            <span className="pil geel">Binnen 2 weken</span> <span className="pil groen">Later</span>{' '}
            <span className="pil grijs">Nog geen beurt</span>
          </p>
        </>
      )}
    </main>
  )
}
