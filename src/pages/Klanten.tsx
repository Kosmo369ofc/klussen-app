import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Klant } from '../lib/types'

export default function Klanten() {
  const { isBeheerder } = useAuth()
  const [klanten, setKlanten] = useState<Klant[] | null>(null)
  const [zoek, setZoek] = useState('')
  const [toonInactief, setToonInactief] = useState(false)

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
      {klanten === null ? (
        <p>Laden…</p>
      ) : zichtbaar.length === 0 ? (
        <p>Geen klanten gevonden.</p>
      ) : (
        <ul className="lijst">
          {zichtbaar.map((k) => (
            <li key={k.id}>
              <Link to={`/klanten/${k.id}`}>
                <strong>{k.naam}</strong>
                {k.adres && <span className="klein">{k.adres}</span>}
                {!k.actief && <span className="label">inactief</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
