import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// Inloggen met een code per e-mail. Een code werkt ook in de app op het
// beginscherm van de telefoon, een link uit de e-mail opent vaak de browser.
export default function Inloggen() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stap, setStap] = useState<'email' | 'code'>('email')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

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
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBezig(false)
    if (error) setFout('Deze code klopt niet of is verlopen.')
  }

  return (
    <main className="pagina smal">
      <h1>Klussen-app</h1>
      {stap === 'email' ? (
        <form onSubmit={vraagCode} className="formulier">
          <label>
            E-mailadres
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button disabled={bezig}>Stuur inlogcode</button>
        </form>
      ) : (
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
          <button type="button" className="link" onClick={() => setStap('email')}>
            Ander e-mailadres
          </button>
        </form>
      )}
      {fout && <p className="fout">{fout}</p>}
    </main>
  )
}
