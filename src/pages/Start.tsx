import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { vandaag } from '../lib/datum'
import type { Ingeklokt, Werkuren } from '../lib/types'
import Busje from '../Busje'

// Startscherm (opmaak 6C): de dag als tijdlijn, met onderaan wat er nu loopt.
// Vertrek: reistijd. Bij de klant: werk. Klaar bij de klant: weer reistijd.

interface KlantKort {
  id: string
  naam: string
}

const kloktijd = (d: Date) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
const tijd = (t: string) => t.slice(0, 5)
const teller = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
const duur = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} uur${min % 60 ? ` ${min % 60}` : ''}`)
const isoDag = (d: Date) => {
  const k = new Date(d)
  k.setMinutes(k.getMinutes() - k.getTimezoneOffset())
  return k.toISOString().slice(0, 10)
}
const groet = () => {
  const u = new Date().getHours()
  return u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond'
}

export default function Start() {
  const { medewerker: ik } = useAuth()
  const [klok, setKlok] = useState<Ingeklokt | null | undefined>(undefined)
  const [regels, setRegels] = useState<Werkuren[]>([])
  const [klanten, setKlanten] = useState<KlantKort[]>([])
  const [klant, setKlant] = useState('')
  const [nu, setNu] = useState(() => Date.now())
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [nietKlaar, setNietKlaar] = useState(false)

  const laad = useCallback(async () => {
    if (!ik) return
    const [k, r] = await Promise.all([
      supabase.from('ingeklokt').select('*').maybeSingle(),
      supabase.from('werkuren').select('*').eq('medewerker_id', ik.id).eq('datum', vandaag()).order('begintijd'),
    ])
    // Bestaat de tabel nog niet (SQL nog niet gedraaid), dan kan er niet geklokt worden.
    setNietKlaar(!!k.error)
    setKlok(k.error ? null : ((k.data as Ingeklokt | null) ?? null))
    setRegels((r.data as Werkuren[]) ?? [])
    setNu(Date.now())
  }, [ik])

  useEffect(() => {
    void laad()
    supabase
      .from('klanten')
      .select('id, naam')
      .eq('actief', true)
      .order('naam')
      .then(({ data }) => setKlanten((data as KlantKort[]) ?? []))
  }, [laad])

  useEffect(() => {
    if (!klok) return
    const t = setInterval(() => setNu(Date.now()), 15000)
    return () => clearInterval(t)
  }, [klok])

  const klantNaam = (id: string | null) => (id ? klanten.find((k) => k.id === id)?.naam ?? 'Oud-klant' : '')

  async function stap(actie: () => PromiseLike<{ error: unknown }>) {
    setBezig(true)
    setFout('')
    const { error } = await actie()
    setBezig(false)
    if (error) setFout('Dat lukte niet. Controleer je internet en probeer het opnieuw.')
    await laad()
  }
  const wissel = (soort: 'werk' | 'reis', klantId: string | null = null) =>
    stap(() => supabase.rpc('klok_wissel', { nieuwe_soort: soort, klant: klantId }))
  const dagKlaar = () => stap(() => supabase.rpc('uitklokken'))
  const pauze = () => stap(() => supabase.rpc('pauze_wisselen'))

  // Wat er nu loopt.
  const start = klok ? new Date(klok.gestart_op) : null
  const pauzeMs = klok ? klok.pauze_minuten * 60000 + (klok.pauze_sinds ? nu - new Date(klok.pauze_sinds).getTime() : 0) : 0
  const loopt = start ? Math.max(0, Math.floor((nu - start.getTime() - pauzeMs) / 60000)) : 0
  const andereDag = start ? isoDag(start) !== vandaag() : false
  const reist = klok?.soort === 'reis'

  // Totalen van vandaag, inclusief wat er nu loopt.
  const min = (r: Werkuren) => Math.round(Number(r.uren) * 60)
  let werkMin = regels.filter((r) => r.soort !== 'reis').reduce((s, r) => s + min(r), 0)
  let reisMin = regels.filter((r) => r.soort === 'reis').reduce((s, r) => s + min(r), 0)
  if (klok && !andereDag) {
    if (reist) reisMin += loopt
    else werkMin += loopt
  }

  const klantKeuze = (
    <select value={klant} onChange={(e) => setKlant(e.target.value)} aria-label="Klant">
      <option value="">Geen klant (algemeen werk)</option>
      {klanten.map((k) => <option key={k.id} value={k.id}>{k.naam}</option>)}
    </select>
  )

  const naarWerk = (
    <button className="knop-klok" disabled={bezig} onClick={() => wissel('werk', klant || null)}>
      🌿 {klok ? 'Aangekomen, start werk' : 'Start werk'}
    </button>
  )
  const naarReis = (
    <button className="knop-klok" disabled={bezig} onClick={() => wissel('reis')}>
      <span className="buspil"><Busje /></span> {klok ? 'Klaar hier, verder reizen' : 'Start reistijd'}
    </button>
  )

  return (
    <main className="pagina">
      <h1>{groet()}{ik ? ` ${ik.naam.split(' ')[0]}` : ''}</h1>
      <p className="klein startdatum">
        {((d) => d.charAt(0).toUpperCase() + d.slice(1))(new Date(nu).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }))}
      </p>

      <section className="vandaagvak">
        <div className="dagkop">
          <strong>Vandaag</strong>
          {(werkMin > 0 || reisMin > 0) && <span className="klein">{duur(werkMin)} werk · {duur(reisMin)} reis</span>}
        </div>
        {regels.length === 0 && !klok ? (
          <p className="klein">Nog niets geklokt.</p>
        ) : (
          <ol className="tijdlijn">
            {regels.map((r) => (
              <li key={r.id} className={r.soort === 'reis' ? 'reis' : 'werk'}>
                <span className="tijden">{tijd(r.begintijd)} – {tijd(r.eindtijd)}</span>
                {r.soort === 'reis' ? <><Busje breed={26} /> Reistijd</> : <>🌿 {klantNaam(r.klant_id) || 'Algemeen werk'}</>}
                <span className="klein">{teller(min(r))}</span>
              </li>
            ))}
            {klok && !andereDag && start && (
              <li className={`nu ${reist ? 'reis' : 'werk'}`}>
                <span className="tijden">{kloktijd(start)} – nu</span>
                {reist ? <><Busje breed={26} /> Reistijd</> : <>🌿 {klantNaam(klok.klant_id) || 'Algemeen werk'}</>}
                <span className="looptijd">{teller(loopt)}</span>
              </li>
            )}
          </ol>
        )}
      </section>

      {nietKlaar ? (
        <p className="melding">Klokken kan nog niet: de database moet nog worden bijgewerkt. Vul je uren in bij <Link to="/uren">Uren invullen</Link>.</p>
      ) : klok === undefined ? null : !klok ? (
        <section className="klokvak">
          <strong>{regels.length ? 'Weer verder?' : 'Klaar om te beginnen?'}</strong>
          {fout && <p className="fout">{fout}</p>}
          {naarReis}
          <span className="klein klokof">of direct aan het werk</span>
          {klantKeuze}
          {naarWerk}
        </section>
      ) : (
        <section className="klokvak bezig">
          <div className="dagkop">
            <div>
              <strong>
                {reist ? <><Busje breed={30} /> Onderweg</> : klok.pauze_sinds ? '☕ Pauze' : `🌿 Aan het werk${klok.klant_id ? ` bij ${klantNaam(klok.klant_id)}` : ''}`}
              </strong>
              <div className="klein">
                {andereDag && start ? `Sinds ${start.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} ${kloktijd(start)}` : start && `Sinds ${kloktijd(start)}`}
              </div>
            </div>
            <span className="kloktijd">{teller(loopt)}</span>
          </div>
          {andereDag && <p className="fout">Je bent vergeten te stoppen. Tik op Dag klaar: de regel stopt dan om 23:59. Pas de tijd daarna aan bij Uren invullen.</p>}
          {fout && <p className="fout">{fout}</p>}
          {reist ? (
            <>
              {klantKeuze}
              {naarWerk}
            </>
          ) : (
            naarReis
          )}
          <div className="klokknoppen">
            {!reist && (
              <button className="knop-klein" disabled={bezig} onClick={pauze}>
                {klok.pauze_sinds ? '▶ Verder werken' : '☕ Pauze'}
              </button>
            )}
            <button className="knop-dagklaar" disabled={bezig} onClick={dagKlaar}>■ Dag klaar</button>
          </div>
        </section>
      )}

      <p className="midden">
        <Link to="/uren" className="klein">Uren achteraf invullen of aanpassen →</Link>
      </p>
    </main>
  )
}
