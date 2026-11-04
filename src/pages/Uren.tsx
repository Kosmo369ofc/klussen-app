import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toonUren, vandaag } from '../lib/datum'
import type { Medewerker, Werkuren } from '../lib/types'

// Standaard bij het invullen van een dag.
const STANDAARD = { begintijd: '07:00', eindtijd: '16:00', pauze: '60' }

function iso(d: Date): string {
  const k = new Date(d)
  k.setMinutes(k.getMinutes() - k.getTimezoneOffset())
  return k.toISOString().slice(0, 10)
}

// De zeven dagen (maandag t/m zondag) van de week rond een datum.
function weekdagen(rond: string): string[] {
  const d = new Date(`${rond}T12:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const dag = new Date(d)
    dag.setDate(d.getDate() + i)
    return iso(dag)
  })
}

function verschuif(rond: string, weken: number): string {
  const d = new Date(`${rond}T12:00:00`)
  d.setDate(d.getDate() + 7 * weken)
  return iso(d)
}

// ISO-weeknummer en -jaar, zoals in de agenda.
function weeknummer(datum: string): [number, number] {
  const d = new Date(`${datum}T12:00:00`)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4, 12)
  const nr = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return [nr, d.getFullYear()]
}

const dagnaam = (d: string) => {
  const n = new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long' })
  return n.charAt(0).toUpperCase() + n.slice(1)
}
const datumKort = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
const tijd = (t: string) => t.slice(0, 5)
const getal = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
const minuten = (t: string) => {
  const [u, m] = t.split(':').map(Number)
  return u * 60 + m
}

interface Concept {
  id: string
  begintijd: string
  eindtijd: string
  pauze: string
  opmerking: string
}

function berekend(c: Concept): number | null {
  if (!c.begintijd || !c.eindtijd) return null
  const netto = minuten(c.eindtijd) - minuten(c.begintijd) - (Number(c.pauze) || 0)
  return netto > 0 ? netto / 60 : null
}

// Een apart bestand met de uren, dat Excel en Google Sheets goed openen.
function urenNaarCsv(regels: Werkuren[], naam: (id: string) => string): string {
  const veld = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rijen = [
    ['Week', 'Dag', 'Datum', 'Medewerker', 'Begin', 'Eind', 'Pauze (min)', 'Uren', 'Opmerking', 'Goedgekeurd'],
    ...regels.map((r) => [
      String(weeknummer(r.datum)[0]),
      dagnaam(r.datum),
      r.datum.split('-').reverse().join('-'),
      naam(r.medewerker_id),
      tijd(r.begintijd),
      tijd(r.eindtijd),
      String(r.pauze_minuten),
      getal(Number(r.uren)),
      r.opmerking ?? '',
      r.goedgekeurd ? 'ja' : 'nee',
    ]),
  ]
  return '﻿' + rijen.map((rij) => rij.map(veld).join(';')).join('\r\n') + '\r\n'
}

function downloaden(bestandsnaam: string, inhoud: string) {
  const url = URL.createObjectURL(new Blob([inhoud], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = bestandsnaam
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Uren() {
  const { medewerker: ik, isBeheerder } = useAuth()
  const [rond, setRond] = useState(vandaag())
  // Wiens week je bekijkt. Invullen kan alleen in je eigen week.
  const [wie, setWie] = useState('')
  const [medewerkers, setMedewerkers] = useState<Medewerker[]>([])
  const [regels, setRegels] = useState<Werkuren[] | null>(null)
  const [alleRegels, setAlleRegels] = useState<Werkuren[]>([])
  const [concepten, setConcepten] = useState<Record<string, Concept>>({})
  const [fout, setFout] = useState<Record<string, string>>({})
  const [bezig, setBezig] = useState('')

  const dagen = useMemo(() => weekdagen(rond), [rond])
  const [weeknr, jaar] = weeknummer(dagen[0])
  const persoon = wie || ik?.id || ''
  const eigen = persoon === ik?.id

  useEffect(() => {
    if (!isBeheerder) return
    supabase
      .from('medewerkers')
      .select('*')
      .order('naam')
      .then(({ data }) => setMedewerkers((data as Medewerker[]) ?? []))
  }, [isBeheerder])

  const laad = useCallback(async () => {
    if (!persoon) return
    const { data } = await supabase
      .from('werkuren')
      .select('*')
      .gte('datum', dagen[0])
      .lte('datum', dagen[6])
      .order('datum')
      .order('begintijd')
    const alles = (data as Werkuren[]) ?? []
    setAlleRegels(alles)
    setRegels(alles.filter((r) => r.medewerker_id === persoon))
  }, [dagen, persoon])

  useEffect(() => {
    setConcepten({})
    setFout({})
    void laad()
  }, [laad])

  const naam = useCallback(
    (id: string) => (id === ik?.id ? ik.naam : medewerkers.find((m) => m.id === id)?.naam ?? '?'),
    [ik, medewerkers],
  )

  const perDag = useMemo(() => {
    const m = new Map<string, Werkuren>()
    for (const r of regels ?? []) if (!m.has(r.datum)) m.set(r.datum, r)
    return m
  }, [regels])

  const totaal = (regels ?? []).reduce((som, r) => som + Number(r.uren), 0)

  function invullen(dag: string) {
    const r = perDag.get(dag)
    setConcepten({
      ...concepten,
      [dag]: r
        ? { id: r.id, begintijd: tijd(r.begintijd), eindtijd: tijd(r.eindtijd), pauze: String(r.pauze_minuten), opmerking: r.opmerking ?? '' }
        : { id: '', ...STANDAARD, opmerking: '' },
    })
  }

  function wijzigConcept(dag: string, wijziging: Partial<Concept>) {
    setConcepten({ ...concepten, [dag]: { ...concepten[dag], ...wijziging } })
  }

  function sluit(dag: string) {
    const rest = { ...concepten }
    delete rest[dag]
    setConcepten(rest)
    setFout({ ...fout, [dag]: '' })
  }

  async function opslaan(dag: string) {
    const c = concepten[dag]
    if (!c.begintijd || !c.eindtijd || c.eindtijd <= c.begintijd) {
      setFout({ ...fout, [dag]: 'De eindtijd moet na de begintijd liggen.' })
      return
    }
    if (berekend(c) === null) {
      setFout({ ...fout, [dag]: 'De pauze is langer dan de werktijd.' })
      return
    }
    setBezig(dag)
    const { error } = await supabase.from('werkuren').upsert({
      id: c.id || crypto.randomUUID(),
      datum: dag,
      begintijd: c.begintijd,
      eindtijd: c.eindtijd,
      pauze_minuten: Math.max(0, Math.round(Number(c.pauze) || 0)),
      opmerking: c.opmerking.trim() || null,
    })
    setBezig('')
    if (error) {
      setFout({ ...fout, [dag]: 'Opslaan lukte niet. Controleer je internet en probeer het opnieuw.' })
      return
    }
    sluit(dag)
    void laad()
  }

  async function wissen(dag: string) {
    const r = perDag.get(dag)
    if (!r || !confirm(`Uren van ${dagnaam(dag).toLowerCase()} ${datumKort(dag)} wissen?`)) return
    await supabase.from('werkuren').delete().eq('id', r.id)
    sluit(dag)
    void laad()
  }

  async function goedkeuren(ids: string[], waarde: boolean) {
    if (ids.length === 0) return
    await supabase.from('werkuren').update({ goedgekeurd: waarde }).in('id', ids)
    void laad()
  }

  const open = (regels ?? []).filter((r) => !r.goedgekeurd).map((r) => r.id)
  const weekTotalen = useMemo(() => {
    const per = new Map<string, number>()
    for (const r of alleRegels) per.set(r.medewerker_id, (per.get(r.medewerker_id) ?? 0) + Number(r.uren))
    return [...per.entries()].sort((a, b) => naam(a[0]).localeCompare(naam(b[0])))
  }, [alleRegels, naam])

  return (
    <main className="pagina">
      <h1>Urenregistratie</h1>

      {isBeheerder && (
        <label className="formulier">
          <span className="klein">Week bekijken van</span>
          <select value={persoon} onChange={(e) => setWie(e.target.value)}>
            {medewerkers.filter((m) => m.actief || m.id === persoon).map((m) => (
              <option key={m.id} value={m.id}>{m.naam}{m.id === ik?.id ? ' (ik)' : ''}</option>
            ))}
          </select>
        </label>
      )}

      <div className="weekkop">
        <button type="button" className="link" onClick={() => setRond(verschuif(rond, -1))} aria-label="Vorige week">←</button>
        <div>
          <h2>Week {weeknr}</h2>
          <span className="klein">{datumKort(dagen[0])} – {datumKort(dagen[6])} {jaar}</span>
        </div>
        <button type="button" className="link" onClick={() => setRond(verschuif(rond, 1))} aria-label="Volgende week">→</button>
      </div>
      {!dagen.includes(vandaag()) && (
        <p className="midden"><button type="button" className="link" onClick={() => setRond(vandaag())}>Naar deze week</button></p>
      )}

      {regels === null ? (
        <p>Laden…</p>
      ) : (
        <ul className="weekdagen">
          {dagen.map((dag) => {
            const r = perDag.get(dag)
            const c = concepten[dag]
            const vandaagDag = dag === vandaag()
            return (
              <li key={dag} className={`weekdag${vandaagDag ? ' vandaag' : ''}${!r && !c ? ' leeg' : ''}`}>
                <div className="dagkop">
                  <div>
                    <strong>{dagnaam(dag)}</strong> <span className="klein">{datumKort(dag)}</span>
                  </div>
                  {r && !c && <strong>{toonUren(Number(r.uren))}</strong>}
                  {c && berekend(c) !== null && <strong>{toonUren(berekend(c)!)}</strong>}
                </div>

                {c ? (
                  <div className="formulier">
                    <div className="drie">
                      <label>Begin<input type="time" value={c.begintijd} onChange={(e) => wijzigConcept(dag, { begintijd: e.target.value })} /></label>
                      <label>Eind<input type="time" value={c.eindtijd} onChange={(e) => wijzigConcept(dag, { eindtijd: e.target.value })} /></label>
                      <label>Pauze (min)<input type="number" inputMode="numeric" min="0" step="5" value={c.pauze} onChange={(e) => wijzigConcept(dag, { pauze: e.target.value })} /></label>
                    </div>
                    <label>Opmerking<input value={c.opmerking} placeholder="Niet verplicht" onChange={(e) => wijzigConcept(dag, { opmerking: e.target.value })} /></label>
                    {fout[dag] && <p className="fout">{fout[dag]}</p>}
                    <div className="rij knoppen">
                      <button disabled={bezig === dag} onClick={() => opslaan(dag)}>{bezig === dag ? 'Bezig…' : 'Opslaan'}</button>
                      <span className="rij">
                        {r && <button className="link gevaar" onClick={() => wissen(dag)}>Wissen</button>}
                        <button className="link" onClick={() => sluit(dag)}>Annuleren</button>
                      </span>
                    </div>
                  </div>
                ) : r ? (
                  <div className="rij knoppen">
                    <span>
                      {tijd(r.begintijd)} – {tijd(r.eindtijd)}, {r.pauze_minuten} min pauze
                      {r.opmerking && <span className="klein"> · {r.opmerking}</span>}
                    </span>
                    <span className="rij">
                      {isBeheerder ? (
                        <label className="vinkje"><input type="checkbox" checked={r.goedgekeurd} onChange={(e) => goedkeuren([r.id], e.target.checked)} /> Akkoord</label>
                      ) : r.goedgekeurd ? (
                        <span className="klein">✓ Goedgekeurd</span>
                      ) : null}
                      {eigen && (isBeheerder || !r.goedgekeurd) && <button className="link" onClick={() => invullen(dag)}>Wijzigen</button>}
                    </span>
                  </div>
                ) : eigen ? (
                  <button className="link" onClick={() => invullen(dag)}>+ Uren invullen</button>
                ) : (
                  <span className="klein">Niet ingevuld</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="controle rij knoppen">
        <strong>Totaal week {weeknr}</strong>
        <strong>{toonUren(totaal)}</strong>
      </div>

      <div className="rij knoppen">
        <button
          type="button"
          disabled={!regels?.length}
          onClick={() => downloaden(`Uren week ${weeknr} ${jaar} ${naam(persoon)}.csv`, urenNaarCsv(regels ?? [], naam))}
        >
          Week downloaden
        </button>
        {isBeheerder && open.length > 0 && (
          <button type="button" className="link" onClick={() => goedkeuren(open, true)}>
            Hele week goedkeuren ({open.length})
          </button>
        )}
      </div>

      {isBeheerder && weekTotalen.length > 0 && (
        <>
          <h2>Iedereen in week {weeknr}</h2>
          <table className="tabel">
            <tbody>
              {weekTotalen.map(([id, uren]) => (
                <tr key={id}>
                  <td><button className="link" onClick={() => setWie(id)}>{naam(id)}</button></td>
                  <td>{toonUren(uren)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <button
              type="button"
              className="link"
              onClick={() => downloaden(`Uren week ${weeknr} ${jaar} iedereen.csv`, urenNaarCsv(alleRegels, naam))}
            >
              Week van iedereen downloaden
            </button>
          </p>
        </>
      )}
    </main>
  )
}
