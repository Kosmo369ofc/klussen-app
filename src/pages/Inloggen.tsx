import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.svg'

// Na inloggen met een code moet je (opnieuw) een wachtwoord kiezen.
export const WACHTWOORD_KIEZEN = 'klussen-app:wachtwoord-kiezen'

// Inloggen met wachtwoord. De eerste keer, of als je het wachtwoord kwijt
// bent, log je in met een code per e-mail en kies je daarna een wachtwoord.
export default function Inloggen() {
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [code, setCode] = useState('')
  const [stap, setStap] = useState<'wachtwoord' | 'email' | 'code'>('wachtwoord')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  function naar(nieuw: typeof stap) {
    setFout('')
    setStap(nieuw)
  }

  async function metWachtwoord(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: wachtwoord })
    setBezig(false)
    if (error) setFout('E-mailadres of wachtwoord klopt niet. Nog geen wachtwoord? Log dan in met een code.')
  }

  async function vraagCode(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout('')
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setBezig(false)
    if (error) setFout('Versturen lukte niet. Controleer het e-mailadres en probeer opnieuw.')
    else setStap('code')
  }

  async function controleerCode(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout('')
    try {
      localStorage.setItem(WACHTWOORD_KIEZEN, '1')
    } catch {
      // Zonder opslag vraagt de app het wachtwoord alleen bij een nieuw account.
    }
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBezig(false)
    if (error) setFout('Deze code klopt niet of is verlopen.')
  }

  const emailVeld = (
    <label>
      E-mailadres
      <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
    </label>
  )

  return (
    <main className="pagina smal">
      <div className="inlogscherm">
        <img src={logo} alt="Darneviel Dienstverlening" />
      </div>
      <h1>Inloggen</h1>
      {stap === 'wachtwoord' && (
        <form onSubmit={metWachtwoord} className="formulier">
          {emailVeld}
          <label>
            Wachtwoord
            <input
              type="password"
              required
              autoComplete="current-password"
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
            />
          </label>
          <button disabled={bezig}>Inloggen</button>
          <button type="button" className="link" onClick={() => naar('email')}>
            Eerste keer of wachtwoord vergeten? Log in met een code
          </button>
        </form>
      )}
      {stap === 'email' && (
        <form onSubmit={vraagCode} className="formulier">
          <p>Je krijgt een eenmalige code per e-mail. Daarna kies je een eigen wachtwoord.</p>
          {emailVeld}
          <button disabled={bezig}>Stuur inlogcode</button>
          <button type="button" className="link" onClick={() => naar('wachtwoord')}>
            Terug naar inloggen met wachtwoord
          </button>
        </form>
      )}
      {stap === 'code' && (
        <form onSubmit={controleerCode} className="formulier">
          <p>We hebben een code gestuurd naar {email}.</p>
          <label>
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button disabled={bezig}>Inloggen</button>
          <button type="button" className="link" onClick={() => naar('email')}>
            Ander e-mailadres
          </button>
        </form>
      )}
      {fout && <p className="fout">{fout}</p>}
    </main>
  )
}

// Na het inloggen met een code: zelf een wachtwoord kiezen.
export function WachtwoordKiezen() {
  const [wachtwoord, setWachtwoord] = useState('')
  const [herhaling, setHerhaling] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  async function opslaan(e: FormEvent) {
    e.preventDefault()
    setFout('')
    if (wachtwoord.length < 8) {
      setFout('Kies een wachtwoord van minstens 8 tekens.')
      return
    }
    if (wachtwoord !== herhaling) {
      setFout('De twee wachtwoorden zijn niet hetzelfde.')
      return
    }
    setBezig(true)
    let { error } = await supabase.auth.updateUser({ password: wachtwoord, data: { wachtwoord_ingesteld: true } })
    // Hetzelfde wachtwoord als eerst is ook goed.
    if (error?.code === 'same_password') ({ error } = await supabase.auth.updateUser({ data: { wachtwoord_ingesteld: true } }))
    if (error) {
      setBezig(false)
      setFout(
        error.code === 'weak_password'
          ? 'Dit wachtwoord is te zwak. Kies een langer wachtwoord met letters en cijfers.'
          : 'Opslaan lukte niet. Probeer het opnieuw.',
      )
      return
    }
    try {
      localStorage.removeItem(WACHTWOORD_KIEZEN)
    } catch {
      // Niets te wissen.
    }
    await supabase.auth.refreshSession()
  }

  return (
    <main className="pagina smal">
      <h1>Kies een wachtwoord</h1>
      <p>Hiermee log je de volgende keer in, samen met je e-mailadres.</p>
      <form onSubmit={opslaan} className="formulier">
        <label>
          Nieuw wachtwoord
          <input type="password" required autoComplete="new-password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} />
        </label>
        <label>
          Nog een keer
          <input type="password" required autoComplete="new-password" value={herhaling} onChange={(e) => setHerhaling(e.target.value)} />
        </label>
        <button disabled={bezig}>{bezig ? 'Bezig…' : 'Wachtwoord opslaan'}</button>
        <button type="button" className="link" onClick={() => supabase.auth.signOut()}>
          Uitloggen
        </button>
      </form>
      {fout && <p className="fout">{fout}</p>}
    </main>
  )
}
