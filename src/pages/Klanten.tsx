import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Klant } from '../lib/types'

// Zolang de SQL-stap nog niet gedaan is, bestaat de kolom niet: dan telt alles als aan.
const kiesbaar = (k: Klant) => k.kiesbaar_bij_klokken !== false

export default function Klanten() {
  const { isBeheerder } = useAuth()
  const [klanten, setKlanten] = useState<Klant[] | null>(null)
  const [zoek, setZoek] = useState('')
  const [toonInactief, setToonInactief] = useState(false)
  const [fout, setFout] = useState('')
  const melding = (useLocation().state as { melding?: string } | null)?.melding

  useEffect(() => {
    supabase
      .from('klanten')
      .select('*')
      .order('naam')
      .then(({ data }) => setKlanten((data as Klant[]) ?? []))
  }, [])

  const zichtbaar = useMemo(() => {
    const z = zoek.trim().toLowerCase()
    return (klanten ?? []).filter(
      (k) =>
        (toonInactief || k.actief) &&
        (!z || k.naam.toLowerCase().includes(z) || (k.adres ?? '').toLowerCase().includes(z)),
    )
  }, [klanten, zoek, toonInactief])

  // Beheerder zet per klant aan of uit of hij in het klokmenu staat.
  async function wisselKiesbaar(k: Klant) {
    const nieuw = !kiesbaar(k)
    setFout('')
    setKlanten((oud) => (oud ?? []).map((x) => (x.id === k.id ? { ...x, kiesbaar_bij_klokken: nieuw } : x)))
    const { error } = await supabase.from('klanten').update({ kiesbaar_bij_klokken: nieuw }).eq('id', k.id)
    if (error) {
      setKlanten((oud) => (oud ?? []).map((x) => (x.id === k.id ? { ...x, kiesbaar_bij_klokken: !nieuw } : x)))
      setFout(
        error.message.includes('kiesbaar')
          ? 'Aan/uit zetten kan nog niet: de SQL-stap in Supabase is nog niet gedaan.'
          : 'Opslaan lukte niet. Probeer het opnieuw.',
      )
    }
  }

  return (
    <main className="pagina">
      <div className="kop">
        <h1>Klanten</h1>
        {isBeheerder && (
          <Link className="knop" to="/klanten/nieuw">
            Nieuwe klant
          </Link>
        )}
      </div>
      {melding && <p className="melding">{melding}</p>}
      <input
        type="search"
        placeholder="Zoek op naam of adres"
        value={zoek}
        onChange={(e) => setZoek(e.target.value)}
      />
      {isBeheerder && (
        <label className="vinkje">
          <input
            type="checkbox"
            checked={toonInactief}
            onChange={(e) => setToonInactief(e.target.checked)}
          />
          Ook inactieve klanten tonen
        </label>
      )}
      {isBeheerder && <p className="klein">⏱️ Schakelaar aan = klant staat in het keuzemenu bij uren klokken.</p>}
      {fout && <p className="fout">{fout}</p>}
      {klanten === null ? (
        <p>Laden…</p>
      ) : zichtbaar.length === 0 ? (
        <p>Geen klanten gevonden.</p>
      ) : (
        <ul className="lijst">
          {zichtbaar.map((k) => (
            <li key={k.id} className={isBeheerder ? 'met-schakelaar' : undefined}>
              <Link to={`/klanten/${k.id}`}>
                <strong>{k.naam}</strong>
                {k.adres && <span className="klein">{k.adres}</span>}
                {!k.actief && <span className="label">inactief</span>}
              </Link>
              {isBeheerder && (
                <button
                  type="button"
                  className={'schakelaar' + (kiesbaar(k) ? ' aan' : '')}
                  role="switch"
                  aria-checked={kiesbaar(k)}
                  aria-label={`${k.naam} kiesbaar bij klokken`}
                  title={kiesbaar(k) ? 'Staat in het klokmenu' : 'Staat niet in het klokmenu'}
                  onClick={() => wisselKiesbaar(k)}
                >
                  ⏱️<span className="baan" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
