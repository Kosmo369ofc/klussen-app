import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toonEuro, toonUren } from '../lib/datum'
import { bezoekBedrag } from '../lib/prijs'
import type { Afspraken, Bezoek, Klant, WerkPrijs } from '../lib/types'

type Filter = 'open' | 'gefactureerd' | 'alles'

type Regel = Omit<Bezoek, 'bezoekregels'> & {
  klanten: Pick<Klant, 'naam' | 'contractvorm'>
  bezoekregels: (Bezoek['bezoekregels'][number] & { werkzaamheden: { meeteenheid: string | null } | null })[]
}

export default function Facturatie() {
  const [filter, setFilter] = useState<Filter>('open')
  const [regels, setRegels] = useState<Regel[] | null>(null)
  const [afspraken, setAfspraken] = useState<Record<string, Afspraken>>({})
  const [prijzen, setPrijzen] = useState<Record<string, WerkPrijs>>({})

  const laad = useCallback(async () => {
    let vraag = supabase
      .from('bezoeken')
      .select('*, klanten(naam, contractvorm), bezoek_uren(medewerker_id, uren), bezoekregels(id, werkzaamheid_id, omschrijving, hoeveelheid, werkzaamheden(meeteenheid))')
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
    supabase
      .from('werkzaamheid_prijzen')
      .select('*')
      .then(({ data }) => setPrijzen(Object.fromEntries(((data as WerkPrijs[]) ?? []).map((p) => [p.werkzaamheid_id, p]))))
  }, [])

  const indicatie = useCallback(
    (b: Regel) => bezoekBedrag(b, b.klanten.contractvorm, afspraken[b.klant_id], prijzen),
    [afspraken, prijzen],
  )

  async function wissel(b: Regel) {
    await supabase.from('bezoeken').update({ gefactureerd: !b.gefactureerd }).eq('id', b.id)
    void laad()
  }

  const totaal = useMemo(
    () => (regels ?? []).reduce((som, b) => som + (indicatie(b) ?? 0), 0),
    [regels, indicatie],
  )

  return (
    <main className="pagina">
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
            {totaal > 0 && `, indicatie ${toonEuro(totaal)} (beurten van klanten zonder vast contract en werk met een eigen prijs)`}
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
                const bedrag = indicatie(b)
                return (
                  <tr key={b.id}>
                    <td>{new Date(`${b.datum}T12:00:00`).toLocaleDateString('nl-NL')}</td>
                    <td>
                      <Link to={`/klanten/${b.klant_id}`}>{b.klanten.naam}</Link>
                      <br />
                      <span className="klein">{b.klanten.contractvorm === 'vast_contract' ? 'Vast contract' : 'Per beurt'}</span>
                    </td>
                    <td>
                      {b.bezoekregels
                        .map((r) =>
                          r.hoeveelheid !== null
                            ? `${r.omschrijving} ${String(r.hoeveelheid).replace('.', ',')} ${r.werkzaamheden?.meeteenheid ?? ''}`.trim()
                            : r.omschrijving,
                        )
                        .join(', ')}
                    </td>
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
