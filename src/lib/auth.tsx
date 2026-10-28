import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Medewerker } from './types'

interface AuthStatus {
  laden: boolean
  sessie: Session | null
  // null als iemand wel is ingelogd maar niet als medewerker bekend is.
  medewerker: Medewerker | null
  isBeheerder: boolean
  // Wat er misging bij het opstarten, om op het scherm te tonen.
  fout: string | null
}

const AuthContext = createContext<AuthStatus>({
  laden: true,
  sessie: null,
  medewerker: null,
  isBeheerder: false,
  fout: null,
})

// Een verzoek dat nooit antwoordt, mag het opstarten niet eeuwig ophouden.
function metTijdslimiet<T>(belofte: PromiseLike<T>, ms: number, wat: string): Promise<T> {
  return Promise.race([
    Promise.resolve(belofte),
    new Promise<T>((_, mislukt) => setTimeout(() => mislukt(new Error(`${wat} duurde langer dan ${ms / 1000} seconden`)), ms)),
  ])
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessie, setSessie] = useState<Session | null>(null)
  const [medewerker, setMedewerker] = useState<Medewerker | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    metTijdslimiet(supabase.auth.getSession(), 15000, 'Sessie ophalen')
      .then(({ data }) => {
        setSessie(data.session)
        if (!data.session) setLaden(false)
      })
      .catch((e: unknown) => {
        setFout(e instanceof Error ? e.message : String(e))
        setLaden(false)
      })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSessie(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = sessie?.user.id
  useEffect(() => {
    if (!userId) {
      setMedewerker(null)
      return
    }
    setLaden(true)
    void (async () => {
      try {
        await metTijdslimiet(supabase.rpc('koppel_eigen_account'), 15000, 'Account koppelen')
        const { data, error } = await metTijdslimiet(
          supabase.from('medewerkers').select('*').eq('user_id', userId).eq('actief', true).maybeSingle(),
          15000,
          'Medewerker ophalen',
        )
        if (error) throw new Error(error.message)
        setMedewerker(data as Medewerker | null)
        setFout(null)
      } catch (e) {
        setFout(e instanceof Error ? e.message : String(e))
      } finally {
        setLaden(false)
      }
    })()
  }, [userId])

  return (
    <AuthContext.Provider
      value={{ laden, sessie, medewerker, isBeheerder: medewerker?.rol === 'beheerder', fout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
