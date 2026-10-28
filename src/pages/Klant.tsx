import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toonDatum, toonUren } from '../lib/datum'
import { frequentieLabel, type Bezoek, type Klant as KlantT, type Medewerker, type Werkzaamheid } from '../lib/types'

export default function Klant() {
  const { id } = useParams()
  const { isBeheerder } = useAuth()
  const melding = (useLocation().state as { melding?: string } | null)?.melding
  const [klant, setKlant] = useState<KlantT | null>(null)
  const [taken, setTaken] = useState<Werkzaamheid[]>([])
  const [bezoeken, setBezoeken] = useState<Bezoek[]>([])
  const [namen, setNamen] = useState<Record<string, string>>({})
  const [alles, setAlles] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase.from('klanten').select('*').eq('id', id).single().then(({ data }) => setKlant(data as KlantT))
    supabase
      .from('werkzaamheden')
      .select('*')
      .eq('klant_id', id)
      .eq('actief', true)
      .order('volgorde')
      .then(({ data }) => setTaken((data as Werkzaamheid[]) ?? []))
    supabase
      .from('medewerkers')
      .select('id, naam')
      .then(({ data }) =>
        setNamen(Object.fromEntries(((data as Pick<Medewerker, 'id' | 'naam'>[]) ?? []).map((m) => [m.id, m.naam]))),
      )
  }, [id])

  useEffect(() => {
    if (!id) return
    supabase
      .from('bezoeken')
      .select('*, bezoek_uren(medewerker_id, uren), bezoekregels(id, werkzaamheid_id, omschrijving)')
      .eq('klant_id', id)
      .order('datum', { ascending: false })
      .limit(alles ? 200 : 3)
      .then(({ data }) => setBezoeken((data as Bezoek[]) ?? []))
  }, [id, alles])

  if (!klant) return <main className="pagina"><p>Laden…</p></main>

  const kaartLink = klant.adres
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(klant.adres)}`
    : null

  return (
    <main className="pagina">
      <Link to="/" className="terug">← Klanten</Link>
      {melding && <p className="melding">{melding}</p>}
      <div className="kop">
        <h1>{klant.naam}</h1>
        {isBeheerder && <Link to={`/klanten/${klant.id}/bewerken`}>Bewerken</Link>}
      </div>
      <p className="klein">{klant.contractvorm === 'vast_contract' ? 'Vast contract' : 'Per beurt'}</p>
      {kaartLink && <p><a href={kaartLink} target="_blank" rel="noreferrer">{klant.adres}</a></p>}
      {klant.telefoon && <p><a href={`tel:${klant.telefoon}`}>{klant.telefoon}</a></p>}
      {klant.notities && <p className="notitie">{klant.notities}</p>}

      <Link className="knop groot" to={`/klanten/${klant.id}/bezoek`}>
        Bezoek invoeren
      </Link>

      <h2>Werkzaamheden</h2>
      {taken.length === 0 ? (
        <p className="klein">Nog geen werkzaamheden toegewezen.</p>
      ) : (
        <ul className="taken">
          {taken.map((t) => (
            <li key={t.id}>
              {t.omschrijving} <span className="klein">{frequentieLabel[t.frequentie]}</span>
            </li>
          ))}
        </ul>
      )}

      <h2>{alles ? 'Alle bezoeken' : 'Laatste bezoeken'}</h2>
      {bezoeken.length === 0 && <p className="klein">Nog geen bezoeken.</p>}
      {bezoeken.map((b) => (
        <article key={b.id} className="bezoek">
          <div className="kop">
            <strong>{toonDatum(b.datum)}</strong>
            {b.gefactureerd && <span className="label">gefactureerd</span>}
          </div>
          <p className="klein">
            {b.bezoek_uren.map((u) => `${namen[u.medewerker_id] ?? '?'} ${toonUren(u.uren)}`).join(', ')}
          </p>
          <ul>
            {b.bezoekregels.map((r) => (
              <li key={r.id}>{r.omschrijving}</li>
            ))}
          </ul>
          {b.opmerkingen && <p className="notitie">{b.opmerkingen}</p>}
        </article>
      ))}
      {!alles && bezoeken.length === 3 && (
        <button className="link" onClick={() => setAlles(true)}>
          Alle bezoeken tonen
        </button>
      )}
    </main>
  )
}
