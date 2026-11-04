import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Medewerker, Rol } from '../lib/types'

const rolNaam = (r: Rol) => (r === 'beheerder' ? 'Beheerder' : 'Medewerker')
const status = (m: Medewerker) => (!m.actief ? 'Uitgezet' : m.user_id ? 'Ingelogd geweest' : 'Nog niet ingelogd')

export default function Medewerkers() {
  const { medewerker: ik } = useAuth()
  const [lijst, setLijst] = useState<Medewerker[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('medewerker')
  const [fout, setFout] = useState('')

  async function laad() {
    const { data } = await supabase.from('medewerkers').select('*').order('naam')
    setLijst((data as Medewerker[]) ?? [])
  }

  useEffect(() => {
    void laad()
  }, [])

  async function toevoegen(e: FormEvent) {
    e.preventDefault()
    setFout('')
    const { error } = await supabase.from('medewerkers').insert({ naam: naam.trim(), email: email.trim().toLowerCase(), rol })
    if (error) {
      setFout(error.code === '23505' ? 'Dit e-mailadres staat er al in.' : 'Toevoegen lukte niet.')
      return
    }
    setNaam('')
    setEmail('')
    setRol('medewerker')
    void laad()
  }

  return (
    <main className="pagina">
      <h1>Medewerkers</h1>
      <p className="klein">
        Voeg iemand toe met zijn of haar e-mailadres. De eerste keer logt die persoon in met een code die per e-mail
        komt, en kiest daarna een eigen wachtwoord.
      </p>
      {lijst.map((m) =>
        open === m.id ? (
          <Bewerken
            key={m.id}
            m={m}
            isIk={m.id === ik?.id}
            sluit={() => setOpen(null)}
            opgeslagen={() => {
              setOpen(null)
              void laad()
            }}
            herlaad={() => void laad()}
          />
        ) : (
          <div key={m.id} className={'medewerkerkaart' + (m.actief ? '' : ' gedimd')}>
            <div>
              <div className="naam">{m.naam}</div>
              <div className="klein">
                {m.email} · {rolNaam(m.rol)} · {status(m)}
              </div>
            </div>
            <button className="knop-klein" onClick={() => setOpen(m.id)}>
              Bewerken
            </button>
          </div>
        ),
      )}

      <h2>Medewerker toevoegen</h2>
      <form onSubmit={toevoegen} className="formulier">
        <label>Naam<input required value={naam} onChange={(e) => setNaam(e.target.value)} /></label>
        <label>E-mailadres<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>
          Rol
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            <option value="medewerker">Medewerker</option>
            <option value="beheerder">Beheerder</option>
          </select>
        </label>
        {fout && <p className="fout">{fout}</p>}
        <button>Toevoegen</button>
      </form>
    </main>
  )
}

function Bewerken({
  m,
  isIk,
  sluit,
  opgeslagen,
  herlaad,
}: {
  m: Medewerker
  isIk: boolean
  sluit: () => void
  opgeslagen: () => void
  herlaad: () => void
}) {
  const [naam, setNaam] = useState(m.naam)
  const [email, setEmail] = useState(m.email)
  const [rol, setRol] = useState<Rol>(m.rol)
  const [wachtwoordOpen, setWachtwoordOpen] = useState(false)
  const [wachtwoord, setWachtwoord] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [melding, setMelding] = useState('')

  function begin() {
    setBezig(true)
    setFout('')
    setMelding('')
  }

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    begin()
    const nieuwEmail = email.trim().toLowerCase()
    if (naam.trim() !== m.naam || nieuwEmail !== m.email.toLowerCase()) {
      const { error } = await supabase.rpc('medewerker_wijzigen', { m_id: m.id, nieuwe_naam: naam, nieuw_email: nieuwEmail })
      if (error) {
        setBezig(false)
        setFout(error.code === '23505' || error.code === '22023' ? error.message + '.' : 'Opslaan lukte niet. Probeer het opnieuw.')
        return
      }
    }
    if (rol !== m.rol) {
      const { error } = await supabase.from('medewerkers').update({ rol }).eq('id', m.id)
      if (error) {
        setBezig(false)
        setFout('De rol opslaan lukte niet.')
        return
      }
    }
    setBezig(false)
    opgeslagen()
  }

  async function codeMailen() {
    begin()
    const { error } = await supabase.auth.signInWithOtp({ email: m.email })
    setBezig(false)
    if (error) setFout('Versturen lukte niet. Probeer het over een uur nog eens, er mogen maar een paar mails per uur.')
    else setMelding(`Er is een inlogcode gemaild naar ${m.email}. Daarmee logt ${m.naam} in en kiest een nieuw wachtwoord.`)
  }

  async function wachtwoordGeven() {
    if (wachtwoord.length < 8) {
      setFout('Kies een wachtwoord van minstens 8 tekens.')
      return
    }
    begin()
    const { error } = await supabase.rpc('tijdelijk_wachtwoord', { m_id: m.id, wachtwoord })
    setBezig(false)
    if (error) {
      setFout('Het wachtwoord instellen lukte niet.')
      return
    }
    setMelding(
      `Klaar. Geef ${m.naam} dit tijdelijke wachtwoord door: ${wachtwoord}. Na het inloggen kiest ${m.naam} zelf een nieuw wachtwoord.`,
    )
    setWachtwoord('')
    setWachtwoordOpen(false)
  }

  async function aanUit() {
    begin()
    await supabase.from('medewerkers').update({ actief: !m.actief }).eq('id', m.id)
    setBezig(false)
    herlaad()
  }

  return (
    <form className="medewerkerkaart open formulier" onSubmit={opslaan}>
      <div className="dagkop">
        <span className="naam">{m.naam}</span>
        <span className="klein">
          {rolNaam(m.rol)} · {status(m)}
        </span>
      </div>
      <label>Naam<input required value={naam} onChange={(e) => setNaam(e.target.value)} /></label>
      <label>
        E-mailadres
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Rol
        <select value={rol} disabled={isIk} onChange={(e) => setRol(e.target.value as Rol)}>
          <option value="medewerker">Medewerker</option>
          <option value="beheerder">Beheerder</option>
        </select>
      </label>

      <div className="wachtwoordvak">
        <b>Wachtwoord</b>
        <p className="klein">Een wachtwoord kan niemand inzien, ook de beheerder niet. Wel kun je iemand weer op weg helpen:</p>
        <div className="knoprij">
          <button type="button" className="knop-klein" disabled={bezig || !m.actief} onClick={codeMailen}>
            Inlogcode mailen
          </button>
          {m.user_id && (
            <button type="button" className="knop-klein" disabled={bezig} onClick={() => setWachtwoordOpen(!wachtwoordOpen)}>
              Tijdelijk wachtwoord geven
            </button>
          )}
        </div>
        {!m.user_id && (
          <p className="klein">{m.naam} heeft nog nooit ingelogd. Stuur een inlogcode om te beginnen.</p>
        )}
        {wachtwoordOpen && (
          <div className="rij">
            <input
              autoComplete="off"
              placeholder="Tijdelijk wachtwoord (minstens 8 tekens)"
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
            />
            <button type="button" disabled={bezig} onClick={wachtwoordGeven}>
              Instellen
            </button>
          </div>
        )}
        {melding && <p className="melding">{melding}</p>}
      </div>

      {fout && <p className="fout">{fout}</p>}
      <div className="knoprij">
        <button disabled={bezig}>Opslaan</button>
        <button type="button" className="knop-klein" onClick={sluit}>
          Annuleren
        </button>
        <span className="opvuller" />
        {!isIk && (
          <button type="button" className={'knop-klein ' + (m.actief ? 'knop-rood' : '')} disabled={bezig} onClick={aanUit}>
            {m.actief ? 'Uitzetten' : 'Aanzetten'}
          </button>
        )}
      </div>
    </form>
  )
}
