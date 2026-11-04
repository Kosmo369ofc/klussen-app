import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toonUren, vandaag } from '../lib/datum'
import type { Medewerker, Werkuren } from '../lib/types'

// Standaard bij het invullen van een dag.
const BEGIN = '07:00'
const EIND = '16:00'
const PAUZE = 60

interface KlantKort {
  id: string
  naam: string
}

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
const alsTijd = (min: number) => {
  const m = Math.min(Math.max(min, 0), 23 * 60 + 59)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

interface Concept {
  id: string
  dag: string
  begintijd: string
  eindtijd: string
  pauze: string
  opmerking: string
  klant_id: string
}

function berekend(c: Concept): number | null {
  if (!c.begintijd || !c.eindtijd) return null
  const netto = minuten(c.eindtijd) - minuten(c.begintijd) - (Number(c.pauze) || 0)
  return netto > 0 ? netto / 60 : null
}

// Nieuwe begintijd: begin je na 16:00 (of na de eindtijd), dan wordt de eindtijd
// een uur later. Past de pauze er dan niet meer in, dan vervalt die.
function nieuweBegintijd(c: Concept, begintijd: string): Concept {
  const volgende = { ...c, begintijd }
  if (!begintijd) return volgende
  if (minuten(begintijd) >= minuten(EIND) || !c.eindtijd || minuten(c.eindtijd) <= minuten(begintijd)) {
    volgende.eindtijd = alsTijd(minuten(begintijd) + 60)
  }
  if (minuten(volgende.eindtijd) - minuten(begintijd) <= (Number(volgende.pauze) || 0)) volgende.pauze = '0'
  return volgende
}

// Een apart bestand met de uren, dat Excel en Google Sheets goed openen.
function urenNaarCsv(regels: Werkuren[], naam: (id: string) => string, klant: (id: string | null) => string): string {
  const veld = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rijen = [
    ['Week', 'Dag', 'Datum', 'Medewerker', 'Klant', 'Begin', 'Eind', 'Pauze (min)', 'Uren', 'Opmerking', 'Goedgekeurd'],
    ...regels.map((r) => [
      String(weeknummer(r.datum)[0]),
      dagnaam(r.datum),
      r.datum.split('-').reverse().join('-'),
      naam(r.medewerker_id),
      klant(r.klant_id),
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
  const [klanten, setKlanten] = useState<KlantKort[]>([])
  const [regels, setRegels] = useState<Werkuren[] | null>(null)
  const [alleRegels, setAlleRegels] = useState<Werkuren[]>([])
  // Open formulieren: op id van de regel, of 'nieuw:<datum>'.
  const [concepten, setConcepten] = useState<Record<string, Concept>>({})
  const [fout, setFout] = useState<Record<string, string>>({})
  const [bezig, setBezig] = useState('')

  const dagen = useMemo(() => weekdagen(rond), [rond])
  const [weeknr, jaar] = weeknummer(dagen[0])
  const persoon = wie || ik?.id || ''
  const eigen = persoon === ik?.id

  useEffect(() => {
    supabase
      .from('klanten')
      .select('id, naam')
      .eq('actief', true)
      .order('naam')
      .then(({ data }) => setKlanten((data as KlantKort[]) ?? []))
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
  const klantNaam = useCallback((id: string | null) => (id ? klanten.find((k) => k.id === id)?.naam ?? 'Oud-klant' : ''), [klanten])

  const perDag = useMemo(() => {
    const m = new Map<string, Werkuren[]>()
    for (const r of regels ?? []) m.set(r.datum, [...(m.get(r.datum) ?? []), r])
    return m
  }, [regels])

  const totaal = (regels ?? []).reduce((som, r) => som + Number(r.uren), 0)

  function nieuw(dag: string) {
    const bestaand = perDag.get(dag) ?? []
    const laatste = bestaand[bestaand.length - 1]
    const begin = laatste ? tijd(laatste.eindtijd) : BEGIN
    const basis: Concept = {
      id: '',
      dag,
      begintijd: begin,
      eindtijd: EIND,
      pauze: String(laatste ? 0 : PAUZE),
      opmerking: '',
      klant_id: laatste?.klant_id ?? '',
    }
    setConcepten({ ...concepten, [`nieuw:${dag}`]: nieuweBegintijd(basis, begin) })
  }

  function wijzigen(r: Werkuren) {
    setConcepten({
      ...concepten,
      [r.id]: {
        id: r.id,
        dag: r.datum,
        begintijd: tijd(r.begintijd),
        eindtijd: tijd(r.eindtijd),
        pauze: String(r.pauze_minuten),
        opmerking: r.opmerking ?? '',
        klant_id: r.klant_id ?? '',
      },
    })
  }

  function zet(sleutel: string, c: Concept) {
    setConcepten({ ...concepten, [sleutel]: c })
  }

  function sluit(sleutel: string) {
    const rest = { ...concepten }
    delete rest[sleutel]
    setConcepten(rest)
    setFout({ ...fout, [sleutel]: '' })
  }

  async function opslaan(sleutel: string) {
    const c = concepten[sleutel]
    if (!c.begintijd || !c.eindtijd || c.eindtijd <= c.begintijd) {
      setFout({ ...fout, [sleutel]: 'De eindtijd moet na de begintijd liggen.' })
      return
    }
    if (berekend(c) === null) {
      setFout({ ...fout, [sleutel]: 'De pauze is langer dan de werktijd.' })
      return
    }
    setBezig(sleutel)
    const { error } = await supabase.from('werkuren').upsert({
      id: c.id || crypto.randomUUID(),
      datum: c.dag,
      begintijd: c.begintijd,
      eindtijd: c.eindtijd,
      pauze_minuten: Math.max(0, Math.round(Number(c.pauze) || 0)),
      opmerking: c.opmerking.trim() || null,
      klant_id: c.klant_id || null,
    })
    setBezig('')
    if (error) {
      setFout({ ...fout, [sleutel]: 'Opslaan lukte niet. Controleer je internet en probeer het opnieuw.' })
      return
    }
    sluit(sleutel)
    void laad()
  }

  async function wissen(r: Werkuren) {
    if (!confirm(`Uren van ${dagnaam(r.datum).toLowerCase()} ${datumKort(r.datum)}, ${tijd(r.begintijd)}–${tijd(r.eindtijd)} wissen?`)) return
    await supabase.from('werkuren').delete().eq('id', r.id)
    sluit(r.id)
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

  function formulier(sleutel: string, c: Concept, bestaand?: Werkuren) {
    const uren = berekend(c)
    return (
      <div className="urenformulier" key={sleutel}>
        <div className="drie">
          <label>Begin<input type="time" value={c.begintijd} onChange={(e) => zet(sleutel, nieuweBegintijd(c, e.target.value))} /></label>
          <label>Eind<input type="time" value={c.eindtijd} onChange={(e) => zet(sleutel, { ...c, eindtijd: e.target.value })} /></label>
          <label>Pauze (min)<input type="number" inputMode="numeric" min="0" step="5" value={c.pauze} onChange={(e) => zet(sleutel, { ...c, pauze: e.target.value })} /></label>
        </div>
        <p className="urenteller">{uren === null ? 'Controleer de tijden' : toonUren(uren)}</p>
        <label>
          Klant
          <select value={c.klant_id} onChange={(e) => zet(sleutel, { ...c, klant_id: e.target.value })}>
            <option value="">Geen klant (algemeen werk)</option>
            {klanten.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
          </select>
        </label>
        <label>Opmerking<input value={c.opmerking} placeholder="Niet verplicht" onChange={(e) => zet(sleutel, { ...c, opmerking: e.target.value })} /></label>
        {fout[sleutel] && <p className="fout">{fout[sleutel]}</p>}
        <div className="rij knoppen">
          <button disabled={bezig === sleutel} onClick={() => opslaan(sleutel)}>{bezig === sleutel ? 'Bezig…' : 'Opslaan'}</button>
          <span className="rij">
            {bestaand && <button className="knop-klein gevaar" onClick={() => wissen(bestaand)}>Wissen</button>}
            <button className="knop-klein" onClick={() => sluit(sleutel)}>Annuleren</button>
          </span>
        </div>
      </div>
    )
  }

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
        <button type="button" className="knop-rond" onClick={() => setRond(verschuif(rond, -1))} aria-label="Vorige week">←</button>
        <div>
          <h2>Week {weeknr}</h2>
          <span className="klein">{datumKort(dagen[0])} – {datumKort(dagen[6])} {jaar}</span>
        </div>
        <button type="button" className="knop-rond" onClick={() => setRond(verschuif(rond, 1))} aria-label="Volgende week">→</button>
      </div>
      {!dagen.includes(vandaag()) && (
        <p className="midden"><button type="button" className="knop-klein" onClick={() => setRond(vandaag())}>Naar deze week</button></p>
      )}

      {regels === null ? (
        <p>Laden…</p>
      ) : (
        <ul className="weekdagen">
          {dagen.map((dag) => {
            const lijst = perDag.get(dag) ?? []
            const nieuwSleutel = `nieuw:${dag}`
            const dagTotaal = lijst.reduce((som, r) => som + Number(r.uren), 0)
            return (
              <li key={dag} className={`weekdag${dag === vandaag() ? ' vandaag' : ''}${lijst.length === 0 && !concepten[nieuwSleutel] ? ' leeg' : ''}`}>
                <div className="dagkop">
                  <div>
                    <strong>{dagnaam(dag)}</strong> <span className="klein">{datumKort(dag)}</span>
                  </div>
                  {lijst.length > 1 && <span className="klein">Totaal {toonUren(dagTotaal)}</span>}
                </div>

                {lijst.map((r) =>
                  concepten[r.id] ? (
                    formulier(r.id, concepten[r.id], r)
                  ) : (
                    <div className="urenregel" key={r.id}>
                      <div>
                        <div>
                          <span className="tijden">{tijd(r.begintijd)} – {tijd(r.eindtijd)}</span>
                          <strong className="urentotaal">{toonUren(Number(r.uren))}</strong>
                        </div>
                        <div className="klein">
                          {r.klant_id ? <span className="klantlabel">{klantNaam(r.klant_id)}</span> : 'Algemeen werk'}
                          {r.pauze_minuten > 0 && ` · ${r.pauze_minuten} min pauze`}
                          {r.opmerking && ` · ${r.opmerking}`}
                        </div>
                      </div>
                      <div className="rij">
                        {isBeheerder ? (
                          <button
                            className={`knop-klein${r.goedgekeurd ? ' akkoord' : ''}`}
                            onClick={() => goedkeuren([r.id], !r.goedgekeurd)}
                            title={r.goedgekeurd ? 'Goedkeuring intrekken' : 'Goedkeuren'}
                          >
                            {r.goedgekeurd ? '✓ Akkoord' : 'Akkoord'}
                          </button>
                        ) : r.goedgekeurd ? (
                          <span className="akkoordlabel">✓ Akkoord</span>
                        ) : null}
                        {eigen && (isBeheerder || !r.goedgekeurd) && (
                          <button className="knop-klein" onClick={() => wijzigen(r)}>Wijzigen</button>
                        )}
                      </div>
                    </div>
                  ),
                )}

                {concepten[nieuwSleutel] ? (
                  formulier(nieuwSleutel, concepten[nieuwSleutel])
                ) : eigen ? (
                  <button className="knop-invullen" onClick={() => nieuw(dag)}>
                    {lijst.length ? '+ Nog een klant of tijdvak' : '+ Uren invullen'}
                  </button>
                ) : lijst.length === 0 ? (
                  <span className="klein">Niet ingevuld</span>
                ) : null}
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
          onClick={() => downloaden(`Uren week ${weeknr} ${jaar} ${naam(persoon)}.csv`, urenNaarCsv(regels ?? [], naam, klantNaam))}
        >
          Week downloaden
        </button>
        {isBeheerder && open.length > 0 && (
          <button type="button" className="knop-klein" onClick={() => goedkeuren(open, true)}>
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
              className="knop-klein"
              onClick={() => downloaden(`Uren week ${weeknr} ${jaar} iedereen.csv`, urenNaarCsv(alleRegels, naam, klantNaam))}
            >
              Week van iedereen downloaden
            </button>
          </p>
        </>
      )}
    </main>
  )
}
