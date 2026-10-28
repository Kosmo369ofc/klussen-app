import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toonEuro, toonUren } from '../lib/datum'
import type { Afspraken, Bezoek, Klant } from '../lib/types'

type Filter = 'open' | 'gefactureerd' | 'alles'

type Regel = Bezoek & { klanten: Pick<Klant, 'naam' | 'contractvorm'> }

// Indicatie van het bedrag: vaste prijs per beurt, anders uren maal uurtarief.
function indicatie(b: Regel, a: Afspraken | undefined): number | null {
  if (!a || b.klanten.contractvorm === 'vast_contract') return null
  if (a.prijs_per_beurt !== null) return a.prijs_per_beurt
  if (a.uurtarief !== null) return a.uurtarief * b.bezoek_uren.reduce((som, u) => som + Number(u.uren), 0)
  return null
}

export default function Facturatie() {
  const [filter, setFilter] = useState<Filter>('open')
  const [regels, setRegels] = useState<Regel[] | null>(null)
  const [afspraken, setAfspraken] = useState<Record<string, Afspraken>>({})

  const laad = useCallback(async () => {
    let vraag = supabase
      .from('bezoeken')
      .select('*, klanten(naam, contractvorm), bezoek_uren(medewerker_id, uren), bezoekregels(id, werkzaamheid_id, omschrijving)')
      .order('datum', { ascending: false })
      .limit(500)
    if (filter === 'open') vraag = vraag.eq('gefactureerd', false)
    if (filter === 'gefactureerd') vraag = vraag.eq('gefactureerd', true)
    const { data } = await vraag
    setRegels((data as Regel[]) ?? [])
  }, [filter])

  useEffect(() => {
    void laad()
  }, [laad])

  useEffect(() => {
    supabase
      .from('contracten')
      .select('*')
      .then(({ data }) => setAfspraken(Object.fromEntries(((data as Afspraken[]) ?? []).map((a) => [a.klant_id, a]))))
  }, [])

  async function wissel(b: Regel) {
    await supabase.from('bezoeken').update({ gefactureerd: !b.gefactureerd }).eq('id', b.id)
    void laad()
  }

  const totaal = useMemo(
    () => (regels ?? []).reduce((som, b) => som + (indicatie(b, afspraken[b.klant_id]) ?? 0), 0),
    [regels, afspraken],
  )

  return (
    <main className="pagina breed">
      <h1>Facturatie</h1>
      <div className="tabs">
        {(
          [
            ['open', 'Nog te factureren'],
            ['gefactureerd', 'Gefactureerd'],
            ['alles', 'Alles'],
          ] as [Filter, string][]
        ).map(([waarde, label]) => (
          <button key={waarde} className={filter === waarde ? 'actief' : 'link'} onClick={() => setFilter(waarde)}>
            {label}
          </button>
        ))}
      </div>
      {regels === null ? (
        <p>Laden…</p>
      ) : regels.length === 0 ? (
        <p>{filter === 'open' ? 'Alles is gefactureerd.' : 'Geen bezoeken gevonden.'}</p>
      ) : (
        <>
          <p className="klein">
            {regels.length} {regels.length === 1 ? 'beurt' : 'beurten'}
            {totaal > 0 && `, indicatie ${toonEuro(totaal)} voor klanten die per beurt betalen`}
          </p>
          <table className="tabel">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Klant</th>
                <th>Wat</th>
                <th>Uren</th>
                <th>Indicatie</th>
                <th>Gefactureerd</th>
              </tr>
            </thead>
            <tbody>
              {regels.map((b) => {
                const bedrag = indicatie(b, afspraken[b.klant_id])
                return (
                  <tr key={b.id}>
                    <td>{new Date(`${b.datum}T12:00:00`).toLocaleDateString('nl-NL')}</td>
                    <td>
                      <Link to={`/klanten/${b.klant_id}`}>{b.klanten.naam}</Link>
                      <br />
                      <span className="klein">{b.klanten.contractvorm === 'vast_contract' ? 'Vast contract' : 'Per beurt'}</span>
                    </td>
                    <td>{b.bezoekregels.map((r) => r.omschrijving).join(', ')}</td>
                    <td>{toonUren(b.bezoek_uren.reduce((som, u) => som + Number(u.uren), 0))}</td>
                    <td>{bedrag === null ? '–' : toonEuro(bedrag)}</td>
                    <td>
                      <input type="checkbox" checked={b.gefactureerd} onChange={() => wissel(b)} aria-label="Gefactureerd" />
                      {b.gefactureerd_op && (
                        <span className="klein"> {new Date(b.gefactureerd_op).toLocaleDateString('nl-NL')}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
