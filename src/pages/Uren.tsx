import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toonDatum, toonUren, vandaag } from '../lib/datum'
import type { Medewerker, Werkuren } from '../lib/types'

type Periode = 'week' | 'maand'

function iso(d: Date): string {
  const k = new Date(d)
  k.setMinutes(k.getMinutes() - k.getTimezoneOffset())
  return k.toISOString().slice(0, 10)
}

// Begin en eind (beide inclusief) van de week (ma t/m zo) of maand rond een datum.
function periodeGrenzen(periode: Periode, rond: string): [string, string] {
  const d = new Date(`${rond}T12:00:00`)
  if (periode === 'week') {
    const ma = new Date(d)
    ma.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const zo = new Date(ma)
    zo.setDate(ma.getDate() + 6)
    return [iso(ma), iso(zo)]
  }
  return [iso(new Date(d.getFullYear(), d.getMonth(), 1, 12)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12))]
}

function verschuif(periode: Periode, rond: string, stap: number): string {
  const d = new Date(`${rond}T12:00:00`)
  if (periode === 'week') d.setDate(d.getDate() + 7 * stap)
  else d.setMonth(d.getMonth() + stap, 1)
  return iso(d)
}

// ISO-weeknummer, zoals in de agenda.
function weeknummer(datum: string): number {
  const d = new Date(`${datum}T12:00:00`)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4, 12)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

function periodeTitel(periode: Periode, van: string): string {
  if (periode === 'week') return `Week ${weeknummer(van)}, ${new Date(`${van}T12:00:00`).getFullYear()}`
  const t = new Date(`${van}T12:00:00`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const tijd = (t: string) => t.slice(0, 5)
const korteDatum = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
const getal = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

// Een apart bestand met de uren, dat Excel en Google Sheets goed openen.
function urenNaarCsv(regels: Werkuren[], naam: (id: string) => string): string {
  const veld = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rijen = [
    ['Datum', 'Week', 'Medewerker', 'Begin', 'Eind', 'Pauze (min)', 'Uren', 'Opmerking', 'Goedgekeurd'],
    ...regels.map((r) => [
      r.datum.split('-').reverse().join('-'),
      String(weeknummer(r.datum)),
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

const leegFormulier = () => ({ id: '', datum: vandaag(), begintijd: '', eindtijd: '', pauze: '30', opmerking: '', medewerker_id: '' })

export default function Uren() {
  const { medewerker: ik, isBeheerder } = useAuth()
  const [periode, setPeriode] = useState<Periode>('week')
  const [rond, setRond] = useState(vandaag())
  const [wie, setWie] = useState('') // leeg: iedereen (alleen beheerder)
  const [regels, setRegels] = useState<Werkuren[] | null>(null)
  const [medewerkers, setMedewerkers] = useState<Medewerker[]>([])
  const [form, setForm] = useState(leegFormulier)
  const [fout, setFout] = useState('')
  const [bezig, setBezig] = useState(false)

  const [van, tot] = periodeGrenzen(periode, rond)

  useEffect(() => {
    if (!isBeheerder) return
    supabase
      .from('medewerkers')
      .select('*')
      .order('naam')
      .then(({ data }) => setMedewerkers((data as Medewerker[]) ?? []))
  }, [isBeheerder])

  const laad = useCallback(async () => {
    let vraag = supabase
      .from('werkuren')
      .select('*')
      .gte('datum', van)
      .lte('datum', tot)
      .order('datum')
      .order('begintijd')
    if (!isBeheerder && ik) vraag = vraag.eq('medewerker_id', ik.id)
    else if (wie) vraag = vraag.eq('medewerker_id', wie)
    const { data, error } = await vraag
    if (error) setFout('Uren ophalen lukte niet.')
    setRegels((data as Werkuren[]) ?? [])
  }, [van, tot, wie, isBeheerder, ik])

  useEffect(() => {
    void laad()
  }, [laad])

  const naam = useCallback(
    (id: string) => (id === ik?.id ? ik.naam : medewerkers.find((m) => m.id === id)?.naam ?? '?'),
    [ik, medewerkers],
  )

  const totalen = useMemo(() => {
    const per = new Map<string, number>()
    for (const r of regels ?? []) per.set(r.medewerker_id, (per.get(r.medewerker_id) ?? 0) + Number(r.uren))
    return [...per.entries()].map(([id, uren]) => ({ id, uren })).sort((a, b) => naam(a.id).localeCompare(naam(b.id)))
  }, [regels, naam])

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    setFout('')
    if (form.eindtijd <= form.begintijd) {
      setFout('De eindtijd moet na de begintijd liggen.')
      return
    }
    const pauze = Math.max(0, Math.round(Number(form.pauze) || 0))
    const [bu, bm] = form.begintijd.split(':').map(Number)
    const [eu, em] = form.eindtijd.split(':').map(Number)
    if (eu * 60 + em - (bu * 60 + bm) <= pauze) {
      setFout('De pauze is langer dan de werktijd.')
      return
    }
    setBezig(true)
    const rij = {
      id: form.id || crypto.randomUUID(),
      datum: form.datum,
      begintijd: form.begintijd,
      eindtijd: form.eindtijd,
      pauze_minuten: pauze,
      opmerking: form.opmerking.trim() || null,
      medewerker_id: (isBeheerder && form.medewerker_id) || (form.id ? undefined : ik?.id),
    }
    const { error } = await supabase.from('werkuren').upsert(rij)
    setBezig(false)
    if (error) {
      setFout('Opslaan lukte niet. Controleer je internet en probeer het opnieuw.')
      return
    }
    setForm({ ...leegFormulier(), datum: form.datum, medewerker_id: form.medewerker_id })
    setRond(form.datum)
    void laad()
  }

  function aanpassen(r: Werkuren) {
    setForm({
      id: r.id,
      datum: r.datum,
      begintijd: tijd(r.begintijd),
      eindtijd: tijd(r.eindtijd),
      pauze: String(r.pauze_minuten),
      opmerking: r.opmerking ?? '',
      medewerker_id: r.medewerker_id,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function verwijderen(r: Werkuren) {
    if (!confirm(`Uren van ${toonDatum(r.datum)} verwijderen?`)) return
    await supabase.from('werkuren').delete().eq('id', r.id)
    void laad()
  }

  async function goedkeuren(ids: string[], waarde: boolean) {
    if (ids.length === 0) return
    await supabase.from('werkuren').update({ goedgekeurd: waarde }).in('id', ids)
    void laad()
  }

  const magWijzigen = (r: Werkuren) => isBeheerder || !r.goedgekeurd
  const open = (regels ?? []).filter((r) => !r.goedgekeurd).map((r) => r.id)

  return (
    <main className="pagina breed">
      <h1>Urenregistratie</h1>
      <p className="klein">
        Vul per werkdag in hoe laat je begon en stopte, en hoe lang je pauze had. Dit staat los van de uren bij de klanten.
      </p>

      <form onSubmit={opslaan} className="formulier urenformulier">
        <h2>{form.id ? 'Uren aanpassen' : 'Uren invullen'}</h2>
        {isBeheerder && (
          <label>
            Medewerker
            <select value={form.medewerker_id || ik?.id || ''} onChange={(e) => setForm({ ...form, medewerker_id: e.target.value })}>
              {medewerkers.filter((m) => m.actief || m.id === form.medewerker_id).map((m) => (
                <option key={m.id} value={m.id}>{m.naam}</option>
              ))}
            </select>
          </label>
        )}
        <label>Datum<input type="date" required value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></label>
        <div className="drie">
          <label>Begin<input type="time" required value={form.begintijd} onChange={(e) => setForm({ ...form, begintijd: e.target.value })} /></label>
          <label>Eind<input type="time" required value={form.eindtijd} onChange={(e) => setForm({ ...form, eindtijd: e.target.value })} /></label>
          <label>Pauze (min)<input type="number" inputMode="numeric" min="0" step="5" value={form.pauze} onChange={(e) => setForm({ ...form, pauze: e.target.value })} /></label>
        </div>
        <label>Opmerking<input value={form.opmerking} placeholder="Bijvoorbeeld: werkplaats, vrachtwagen ophalen" onChange={(e) => setForm({ ...form, opmerking: e.target.value })} /></label>
        {fout && <p className="fout">{fout}</p>}
        <div className="rij knoppen">
          <button disabled={bezig}>{bezig ? 'Bezig…' : 'Opslaan'}</button>
          {form.id && <button type="button" className="link" onClick={() => setForm(leegFormulier())}>Annuleren</button>}
        </div>
      </form>

      <h2>{periodeTitel(periode, van)}</h2>
      <div className="rij knoppen urenbalk">
        <div className="rij">
          <button type="button" className="link" onClick={() => setRond(verschuif(periode, rond, -1))}>← Vorige</button>
          <button type="button" className="link" onClick={() => setRond(vandaag())}>Nu</button>
          <button type="button" className="link" onClick={() => setRond(verschuif(periode, rond, 1))}>Volgende →</button>
        </div>
        <div className="rij">
          <select value={periode} onChange={(e) => setPeriode(e.target.value as Periode)}>
            <option value="week">Per week</option>
            <option value="maand">Per maand</option>
          </select>
          {isBeheerder && (
            <select value={wie} onChange={(e) => setWie(e.target.value)}>
              <option value="">Iedereen</option>
              {medewerkers.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
          )}
        </div>
      </div>

      {regels === null ? (
        <p>Laden…</p>
      ) : regels.length === 0 ? (
        <p>Geen uren in deze periode.</p>
      ) : (
        <>
          <div className="opbouw">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Datum</th>
                  {isBeheerder && <th>Medewerker</th>}
                  <th>Tijd</th>
                  <th className="verberg-smal">Pauze</th>
                  <th>Uren</th>
                  <th className="verberg-smal">Opmerking</th>
                  <th title="Goedgekeurd">Akkoord</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {regels.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{korteDatum(r.datum)}</td>
                    {isBeheerder && <td>{naam(r.medewerker_id)}</td>}
                    <td className="nowrap">{tijd(r.begintijd)}–{tijd(r.eindtijd)}</td>
                    <td className="verberg-smal">{r.pauze_minuten} min</td>
                    <td>{getal(Number(r.uren))}</td>
                    <td className="verberg-smal">{r.opmerking}</td>
                    <td>
                      {isBeheerder ? (
                        <input type="checkbox" checked={r.goedgekeurd} onChange={(e) => goedkeuren([r.id], e.target.checked)} />
                      ) : r.goedgekeurd ? '✓' : '–'}
                    </td>
                    <td>
                      {magWijzigen(r) && (
                        <span className="rij">
                          <button className="link" onClick={() => aanpassen(r)}>Wijzig</button>
                          <button className="link gevaar" onClick={() => verwijderen(r)}>Wis</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="controle">
            <strong>Totaal</strong>
            <ul>
              {totalen.map((t) => <li key={t.id}>{isBeheerder ? `${naam(t.id)}: ` : ''}{toonUren(t.uren)}</li>)}
            </ul>
          </div>

          <div className="rij knoppen">
            <button
              type="button"
              onClick={() =>
                downloaden(
                  `Uren ${periodeTitel(periode, van)}${isBeheerder && wie ? ` ${naam(wie)}` : !isBeheerder && ik ? ` ${ik.naam}` : ''}.csv`,
                  urenNaarCsv(regels, naam),
                )
              }
            >
              Downloaden als bestand
            </button>
            {isBeheerder && open.length > 0 && (
              <button type="button" className="link" onClick={() => goedkeuren(open, true)}>
                Alles in deze {periode} goedkeuren ({open.length})
              </button>
            )}
          </div>
        </>
      )}
    </main>
  )
}
