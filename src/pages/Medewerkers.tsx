import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Medewerker, Rol } from '../lib/types'

export default function Medewerkers() {
  const { medewerker: ik } = useAuth()
  const [lijst, setLijst] = useState<Medewerker[]>([])
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

  async function wijzig(m: Medewerker, wijziging: Partial<Medewerker>) {
    await supabase.from('medewerkers').update(wijziging).eq('id', m.id)
    void laad()
  }

  return (
    <main className="pagina">
      <h1>Medewerkers</h1>
      <p className="klein">
        Voeg iemand toe met zijn of haar e-mailadres. Daarna kan die persoon inloggen met een code die per e-mail komt.
      </p>
      <table className="tabel">
        <thead>
          <tr><th>Naam</th><th>E-mail</th><th>Rol</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {lijst.map((m) => (
            <tr key={m.id} className={m.actief ? '' : 'gedimd'}>
              <td>{m.naam}</td>
              <td>{m.email}</td>
              <td>
                <select value={m.rol} disabled={m.id === ik?.id} onChange={(e) => wijzig(m, { rol: e.target.value as Rol })}>
                  <option value="medewerker">Medewerker</option>
                  <option value="beheerder">Beheerder</option>
                </select>
              </td>
              <td>{!m.actief ? 'Uitgezet' : m.user_id ? 'Ingelogd geweest' : 'Nog niet ingelogd'}</td>
              <td>
                {m.id !== ik?.id && (
                  <button className="link" onClick={() => wijzig(m, { actief: !m.actief })}>
                    {m.actief ? 'Uitzetten' : 'Aanzetten'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
